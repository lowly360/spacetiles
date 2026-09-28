use serde::Serialize;
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
use std::{
    collections::{HashSet, VecDeque},
    ffi::OsString,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub path: String,
    pub message: String,
    pub permission_denied: bool,
}

// Arena indices are stable IDs within one scan. Names retain non-UTF8 path bytes for Finder.
pub struct Node {
    pub name: OsString,
    pub parent: Option<usize>,
    pub children: Vec<usize>,
    pub directory: bool,
    pub logical: u64,
    pub allocated: u64,
    pub note: Option<String>,
}
pub struct Tree {
    pub root: PathBuf,
    pub nodes: Vec<Node>,
    pub files: u64,
    pub directories: u64,
    pub skipped: u64,
    pub errors: u64,
    pub denied: u64,
    pub issues: Vec<Issue>,
    pub status: &'static str,
    pub started: Instant,
    pub elapsed_ms: u64,
}
pub struct Job {
    pub id: u64,
    pub cancel: AtomicBool,
    pub tree: Mutex<Tree>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: usize,
    pub name: String,
    pub directory: bool,
    pub logical: u64,
    pub allocated: u64,
    pub note: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TileNode {
    #[serde(flatten)]
    pub entry: Entry,
    pub children: Vec<TileNode>,
    pub other_size: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub scan_id: u64,
    pub status: String,
    pub files: u64,
    pub directories: u64,
    pub skipped: u64,
    pub errors: u64,
    pub denied: u64,
    pub issues: Vec<Issue>,
    pub elapsed_ms: u64,
    pub root_path: String,
    pub current_path: String,
    pub total_logical: u64,
    pub total_allocated: u64,
    pub breadcrumbs: Vec<Entry>,
    pub tree: TileNode,
    pub entries: Vec<Entry>,
    pub child_count: usize,
}

impl Node {
    fn size(&self, allocated: bool) -> u64 {
        if allocated {
            self.allocated
        } else {
            self.logical
        }
    }
    fn entry(&self, id: usize) -> Entry {
        Entry {
            id,
            name: self.name.to_string_lossy().into_owned(),
            directory: self.directory,
            logical: self.logical,
            allocated: self.allocated,
            note: self.note.clone(),
        }
    }
}
impl Tree {
    pub fn new(root: PathBuf) -> Self {
        let name = root.file_name().unwrap_or(root.as_os_str()).to_os_string();
        Self {
            root,
            nodes: vec![Node {
                name,
                parent: None,
                children: vec![],
                directory: true,
                logical: 0,
                allocated: 0,
                note: None,
            }],
            files: 0,
            directories: 1,
            skipped: 0,
            errors: 0,
            denied: 0,
            issues: vec![],
            status: "scanning",
            started: Instant::now(),
            elapsed_ms: 0,
        }
    }
    pub fn path(&self, id: usize) -> Option<PathBuf> {
        self.nodes.get(id)?;
        let mut pieces = vec![];
        let mut current = id;
        while let Some(parent) = self.nodes[current].parent {
            pieces.push(&self.nodes[current].name);
            current = parent;
        }
        let mut path = self.root.clone();
        for part in pieces.iter().rev() {
            path.push(part);
        }
        Some(path)
    }
    fn issue(&mut self, path: &std::path::Path, error: std::io::Error) {
        let denied = error.kind() == std::io::ErrorKind::PermissionDenied
            || matches!(error.raw_os_error(), Some(1 | 13));
        self.errors += 1;
        if denied {
            self.denied += 1;
        }
        if self.issues.len() < 100 {
            self.issues.push(Issue {
                path: path.to_string_lossy().into_owned(),
                message: error.to_string(),
                permission_denied: denied,
            });
        }
    }
    fn append(
        &mut self,
        parent: usize,
        name: OsString,
        directory: bool,
        logical: u64,
        allocated: u64,
        note: Option<String>,
    ) -> usize {
        let id = self.nodes.len();
        self.nodes.push(Node {
            name,
            parent: Some(parent),
            children: vec![],
            directory,
            logical,
            allocated,
            note,
        });
        self.nodes[parent].children.push(id);
        // Update ancestors once per discovered file; partial snapshots remain internally consistent.
        let mut ancestor = Some(parent);
        while let Some(index) = ancestor {
            self.nodes[index].logical = self.nodes[index].logical.saturating_add(logical);
            self.nodes[index].allocated = self.nodes[index].allocated.saturating_add(allocated);
            ancestor = self.nodes[index].parent;
        }
        id
    }
    fn ranked(&self, id: usize, allocated: bool, limit: usize) -> Vec<usize> {
        let mut ids = self.nodes[id].children.clone();
        let compare = |a: &usize, b: &usize| {
            self.nodes[*b]
                .size(allocated)
                .cmp(&self.nodes[*a].size(allocated))
                .then(a.cmp(b))
        };
        if ids.len() > limit {
            ids.select_nth_unstable_by(limit, compare);
            ids.truncate(limit);
        }
        ids.sort_unstable_by(compare);
        ids
    }
    fn tile(&self, id: usize, allocated: bool, depth: usize, budget: &mut usize) -> TileNode {
        let node = &self.nodes[id];
        let mut children = vec![];
        let mut shown = 0_u64;
        if depth > 0 && *budget > 0 {
            for child in self.ranked(id, allocated, 60) {
                if *budget == 0 {
                    break;
                }
                *budget -= 1;
                shown = shown.saturating_add(self.nodes[child].size(allocated));
                children.push(self.tile(child, allocated, depth - 1, budget));
            }
        }
        // Only expanded directories need an aggregate remainder rectangle.
        let other_size = if depth > 0 && node.directory {
            node.size(allocated).saturating_sub(shown)
        } else {
            0
        };
        TileNode {
            entry: node.entry(id),
            children,
            other_size,
        }
    }
    pub fn snapshot(
        &self,
        scan_id: u64,
        id: usize,
        allocated: bool,
        files_only: bool,
    ) -> Result<Snapshot, String> {
        let node = self
            .nodes
            .get(id)
            .filter(|n| n.directory)
            .ok_or("directory_unavailable")?;
        let mut breadcrumbs = VecDeque::new();
        let mut ancestor = Some(id);
        while let Some(index) = ancestor {
            breadcrumbs.push_front(self.nodes[index].entry(index));
            ancestor = self.nodes[index].parent;
        }
        let entries = if files_only {
            let mut ids: Vec<_> = node
                .children
                .iter()
                .copied()
                .filter(|i| !self.nodes[*i].directory)
                .collect();
            let compare = |a: &usize, b: &usize| {
                self.nodes[*b]
                    .size(allocated)
                    .cmp(&self.nodes[*a].size(allocated))
                    .then(a.cmp(b))
            };
            if ids.len() > 100 {
                ids.select_nth_unstable_by(100, compare);
                ids.truncate(100);
            }
            ids.sort_unstable_by(compare);
            ids.into_iter().map(|i| self.nodes[i].entry(i)).collect()
        } else {
            self.ranked(id, allocated, 100)
                .into_iter()
                .map(|i| self.nodes[i].entry(i))
                .collect()
        };
        Ok(Snapshot {
            scan_id,
            status: self.status.into(),
            files: self.files,
            directories: self.directories,
            skipped: self.skipped,
            errors: self.errors,
            denied: self.denied,
            issues: self.issues.clone(),
            elapsed_ms: if self.status == "scanning" {
                self.started.elapsed().as_millis() as u64
            } else {
                self.elapsed_ms
            },
            root_path: self.root.to_string_lossy().into_owned(),
            current_path: self.path(id).unwrap().to_string_lossy().into_owned(),
            total_logical: self.nodes[0].logical,
            total_allocated: self.nodes[0].allocated,
            breadcrumbs: breadcrumbs.into(),
            tree: self.tile(id, allocated, 3, &mut 1200),
            entries,
            child_count: node.children.len(),
        })
    }
}

pub fn scan(job: Arc<Job>) {
    let root = job.tree.lock().unwrap().root.clone();
    #[cfg(unix)]
    let root_device = fs::metadata(&root).map(|m| m.dev()).unwrap_or(0);
    let mut directories = vec![(root, 0)];
    let mut identities = HashSet::new();
    while let Some((path, parent)) = directories.pop() {
        if job.cancel.load(Ordering::Relaxed) {
            break;
        }
        let reader = match fs::read_dir(&path) {
            Ok(reader) => reader,
            Err(error) => {
                let mut tree = job.tree.lock().unwrap();
                tree.nodes[parent].note = Some("unread".into());
                tree.issue(&path, error);
                continue;
            }
        };
        // I/O stays outside the tree lock so snapshots and cancellation remain responsive.
        for result in reader {
            if job.cancel.load(Ordering::Relaxed) {
                break;
            }
            let entry = match result {
                Ok(entry) => entry,
                Err(error) => {
                    job.tree.lock().unwrap().issue(&path, error);
                    continue;
                }
            };
            let child_path = entry.path();
            let metadata = match fs::symlink_metadata(&child_path) {
                Ok(metadata) => metadata,
                Err(error) => {
                    job.tree.lock().unwrap().issue(&child_path, error);
                    continue;
                }
            };
            let mut note = None;
            let mut logical = 0;
            let mut allocated = 0;
            let directory = metadata.is_dir();
            let mut skip = false;
            if metadata.file_type().is_symlink() {
                note = Some("symlink".into());
                skip = true;
            } else if !directory && !metadata.is_file() {
                note = Some("special_file".into());
                skip = true;
            }
            #[cfg(unix)]
            if metadata.dev() != root_device {
                note = Some("other_device".into());
                skip = true;
            }
            if metadata.is_file() && !skip {
                #[cfg(unix)]
                let duplicate =
                    metadata.nlink() > 1 && !identities.insert((metadata.dev(), metadata.ino()));
                #[cfg(not(unix))]
                let duplicate = false;
                if duplicate {
                    note = Some("duplicate_link".into());
                } else {
                    logical = metadata.len();
                    #[cfg(unix)]
                    {
                        allocated = metadata.blocks().saturating_mul(512);
                    }
                    #[cfg(not(unix))]
                    {
                        allocated = logical;
                    }
                }
            }
            let mut tree = job.tree.lock().unwrap();
            if skip {
                tree.skipped += 1;
            } else if directory {
                tree.directories += 1;
            } else {
                tree.files += 1;
            }
            let id = tree.append(
                parent,
                entry.file_name(),
                directory,
                logical,
                allocated,
                note,
            );
            drop(tree);
            if directory && !skip {
                directories.push((child_path, id));
            }
        }
    }
    let mut tree = job.tree.lock().unwrap();
    tree.status = if job.cancel.load(Ordering::Relaxed) {
        "cancelled"
    } else {
        "complete"
    };
    tree.elapsed_ms = tree.started.elapsed().as_millis() as u64;
}

#[cfg(test)]
mod tests {
    use super::*;
    fn job(root: PathBuf) -> Arc<Job> {
        Arc::new(Job {
            id: 1,
            cancel: AtomicBool::new(false),
            tree: Mutex::new(Tree::new(root)),
        })
    }
    #[test]
    fn aggregates_nested_empty_and_many_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("empty")).unwrap();
        let mut deep = dir.path().to_path_buf();
        for _ in 0..40 {
            deep.push("nested");
            fs::create_dir(&deep).unwrap();
        }
        fs::write(deep.join("leaf"), [1; 37]).unwrap();
        for index in 0..1000 {
            fs::write(dir.path().join(format!("{index}")), [0; 10]).unwrap();
        }
        let job = job(dir.path().to_path_buf());
        scan(job.clone());
        let tree = job.tree.lock().unwrap();
        assert_eq!(tree.nodes[0].logical, 10037);
        assert_eq!(tree.files, 1001);
        assert_eq!(tree.directories, 42);
        assert_eq!(tree.status, "complete");
        let snapshot = tree.snapshot(1, 0, false, false).unwrap();
        assert_eq!(snapshot.entries.len(), 100);
        assert_eq!(
            snapshot
                .tree
                .children
                .iter()
                .map(|n| n.entry.logical)
                .sum::<u64>()
                + snapshot.tree.other_size,
            10037
        );
    }
    #[test]
    #[cfg(unix)]
    fn avoids_symlink_cycles_and_deduplicates_hardlinks() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("original"), [0; 23]).unwrap();
        fs::hard_link(dir.path().join("original"), dir.path().join("copy")).unwrap();
        std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).unwrap();
        let job = job(dir.path().to_path_buf());
        scan(job.clone());
        let tree = job.tree.lock().unwrap();
        assert_eq!(tree.nodes[0].logical, 23);
        assert_eq!(tree.skipped, 1);
        assert_eq!(tree.files, 2);
    }
    #[test]
    fn cancellation_preserves_partial_results() {
        let dir = tempfile::tempdir().unwrap();
        let job = job(dir.path().to_path_buf());
        job.cancel.store(true, Ordering::Relaxed);
        scan(job.clone());
        assert_eq!(job.tree.lock().unwrap().status, "cancelled");
    }
    #[test]
    fn missing_directory_and_permission_error_are_visible() {
        let job = job(PathBuf::from("/nonexistent-spacetiles-test-root"));
        scan(job.clone());
        let mut tree = job.tree.lock().unwrap();
        assert_eq!(tree.errors, 1);
        tree.issue(
            std::path::Path::new("/protected"),
            std::io::Error::from_raw_os_error(1),
        );
        assert_eq!(tree.denied, 1);
        assert!(tree.issues.last().unwrap().permission_denied);
    }
    #[test]
    fn old_job_cannot_mutate_new_tree() {
        let dir = tempfile::tempdir().unwrap();
        let old = job(dir.path().to_path_buf());
        let new = job(dir.path().to_path_buf());
        old.cancel.store(true, Ordering::Relaxed);
        scan(old);
        assert_eq!(new.tree.lock().unwrap().status, "scanning");
    }
    #[test]
    #[cfg(unix)]
    fn unreadable_directory_is_not_reported_as_empty_success() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let restricted = dir.path().join("restricted");
        fs::create_dir(&restricted).unwrap();
        fs::write(restricted.join("hidden"), [1; 31]).unwrap();
        fs::set_permissions(&restricted, fs::Permissions::from_mode(0o000)).unwrap();
        let job = job(dir.path().to_path_buf());
        scan(job.clone());
        fs::set_permissions(&restricted, fs::Permissions::from_mode(0o700)).unwrap();
        let tree = job.tree.lock().unwrap();
        assert_eq!(tree.errors, 1);
        assert_eq!(tree.denied, 1);
        assert!(tree.nodes[1].note.is_some());
        assert_eq!(tree.issues[0].path, restricted.to_string_lossy());
    }
    #[test]
    fn elapsed_scan_can_be_cancelled_with_a_consistent_partial_tree() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5000 {
            fs::write(dir.path().join(format!("{i}")), [1; 7]).unwrap();
        }
        let job = job(dir.path().to_path_buf());
        let worker_job = job.clone();
        let worker = std::thread::spawn(move || scan(worker_job));
        let deadline = Instant::now() + std::time::Duration::from_secs(5);
        loop {
            let tree = job.tree.lock().unwrap();
            if tree.files > 0 {
                job.cancel.store(true, Ordering::Relaxed);
                break;
            }
            drop(tree);
            assert!(Instant::now() < deadline, "worker did not make progress");
            std::thread::yield_now();
        }
        worker.join().unwrap();
        let tree = job.tree.lock().unwrap();
        assert_eq!(tree.status, "cancelled");
        assert!(tree.files > 0 && tree.files < 5000);
        assert_eq!(tree.nodes[0].logical, tree.files * 7);
    }
}
