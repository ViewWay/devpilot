//! Task scheduler — manages and executes scheduled tasks.

use crate::error::{SchedulerError, SchedulerResult};
use crate::task::{TaskDef, TaskId, TaskStatus};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio::time::{self, Duration};

/// Callback type for task execution.
pub type TaskCallback = Arc<dyn Fn(TaskDef) + Send + Sync>;

/// The scheduler manages cron tasks.
pub struct Scheduler {
    tasks: Arc<RwLock<HashMap<TaskId, TaskDef>>>,
    running: Arc<Mutex<bool>>,
    callback: Option<TaskCallback>,
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl Scheduler {
    /// Create a new scheduler.
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
            callback: None,
        }
    }

    /// Set a callback for task execution.
    pub fn with_callback(mut self, cb: TaskCallback) -> Self {
        self.callback = Some(cb);
        self
    }

    /// Add a task.
    pub async fn add_task(&self, task: TaskDef) -> SchedulerResult<TaskId> {
        let id = task.id.clone();
        let mut tasks = self.tasks.write().await;
        if tasks.contains_key(&id) {
            return Err(SchedulerError::TaskExists(id));
        }
        tasks.insert(id.clone(), task);
        Ok(id)
    }

    /// Remove a task.
    pub async fn remove_task(&self, id: &str) -> SchedulerResult<TaskDef> {
        let mut tasks = self.tasks.write().await;
        tasks
            .remove(id)
            .ok_or_else(|| SchedulerError::TaskNotFound(id.to_string()))
    }

    /// Pause a task.
    pub async fn pause_task(&self, id: &str) -> SchedulerResult<()> {
        let mut tasks = self.tasks.write().await;
        let task = tasks
            .get_mut(id)
            .ok_or_else(|| SchedulerError::TaskNotFound(id.to_string()))?;
        task.status = TaskStatus::Paused;
        Ok(())
    }

    /// Resume a paused task.
    pub async fn resume_task(&self, id: &str) -> SchedulerResult<()> {
        let mut tasks = self.tasks.write().await;
        let task = tasks
            .get_mut(id)
            .ok_or_else(|| SchedulerError::TaskNotFound(id.to_string()))?;
        task.status = TaskStatus::Active;
        task.update_next_run();
        Ok(())
    }

    /// Get a task by ID.
    pub async fn get_task(&self, id: &str) -> SchedulerResult<TaskDef> {
        let tasks = self.tasks.read().await;
        tasks
            .get(id)
            .cloned()
            .ok_or_else(|| SchedulerError::TaskNotFound(id.to_string()))
    }

    /// List all tasks.
    pub async fn list_tasks(&self) -> Vec<TaskDef> {
        let tasks = self.tasks.read().await;
        tasks.values().cloned().collect()
    }

    /// Get the number of active tasks.
    pub async fn active_count(&self) -> usize {
        let tasks = self.tasks.read().await;
        tasks
            .values()
            .filter(|t| t.status == TaskStatus::Active)
            .count()
    }

    /// Start the scheduler loop. Runs until cancelled.
    pub async fn start(&self) {
        {
            let mut running = self.running.lock().await;
            if *running {
                tracing::warn!("scheduler already running");
                return;
            }
            *running = true;
        }

        tracing::info!("scheduler started");

        // Initialize next_run for all tasks
        {
            let mut tasks = self.tasks.write().await;
            for task in tasks.values_mut() {
                task.update_next_run();
            }
        }

        loop {
            // Check if still running
            {
                let running = self.running.lock().await;
                if !*running {
                    break;
                }
            }

            // Find the soonest next_run among active tasks
            let sleep_duration = {
                let tasks = self.tasks.read().await;
                let soonest = tasks
                    .values()
                    .filter(|t| t.status == TaskStatus::Active && t.next_run.is_some())
                    .map(|t| t.next_run.unwrap())
                    .min();

                match soonest {
                    Some(next) => {
                        let now = chrono::Utc::now();
                        let dur = next - now;
                        if dur.num_milliseconds() > 0 {
                            Duration::from_millis(dur.num_milliseconds() as u64)
                        } else {
                            Duration::from_millis(10) // Already past due
                        }
                    }
                    None => Duration::from_secs(1), // No tasks, poll every second
                }
            };

            time::sleep(sleep_duration).await;

            // Fire due tasks
            let now = chrono::Utc::now();
            let mut tasks = self.tasks.write().await;

            for task in tasks.values_mut() {
                if task.status != TaskStatus::Active || !task.can_execute() {
                    continue;
                }

                if let Some(next) = task.next_run
                    && now >= next
                {
                    task.record_execution();
                    let task_clone = task.clone();

                    if let Some(ref cb) = self.callback {
                        cb(task_clone);
                    } else {
                        tracing::info!("task {} fired (action: {:?})", task.id, task.action);
                    }

                    task.update_next_run();
                }
            }

            // Remove tasks that have exceeded max_executions
            tasks.retain(|_, t| t.can_execute() || t.status == TaskStatus::Paused);
        }

        tracing::info!("scheduler stopped");
    }

    /// Stop the scheduler.
    pub async fn stop(&self) {
        let mut running = self.running.lock().await;
        *running = false;
    }

    /// Check if the scheduler is running.
    pub async fn is_running(&self) -> bool {
        *self.running.lock().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn add_and_list_tasks() {
        let scheduler = Scheduler::new();
        let task = TaskDef::from_cron("0 * * * * *")
            .unwrap()
            .with_name("test-task");

        let id = scheduler.add_task(task).await.unwrap();
        let tasks = scheduler.list_tasks().await;
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, id);
        assert_eq!(tasks[0].name.as_deref(), Some("test-task"));
    }

    #[tokio::test]
    async fn remove_task() {
        let scheduler = Scheduler::new();
        let task = TaskDef::from_cron("0 * * * * *").unwrap();
        let id = scheduler.add_task(task).await.unwrap();

        let removed = scheduler.remove_task(&id).await.unwrap();
        assert_eq!(removed.id, id);
        assert!(scheduler.list_tasks().await.is_empty());
    }

    #[tokio::test]
    async fn pause_and_resume() {
        let scheduler = Scheduler::new();
        let task = TaskDef::from_cron("0 * * * * *").unwrap();
        let id = scheduler.add_task(task).await.unwrap();

        scheduler.pause_task(&id).await.unwrap();
        let t = scheduler.get_task(&id).await.unwrap();
        assert_eq!(t.status, TaskStatus::Paused);
        assert!(!t.can_execute());

        scheduler.resume_task(&id).await.unwrap();
        let t = scheduler.get_task(&id).await.unwrap();
        assert_eq!(t.status, TaskStatus::Active);
        assert!(t.can_execute());
    }

    #[tokio::test]
    async fn duplicate_task_rejected() {
        let scheduler = Scheduler::new();
        let task = TaskDef::from_cron("0 * * * * *").unwrap();
        let _id = task.id.clone();
        scheduler.add_task(task.clone()).await.unwrap();

        // Try adding again with same ID
        let result = scheduler.add_task(task).await;
        assert!(matches!(result, Err(SchedulerError::TaskExists(_))));
    }

    #[tokio::test]
    async fn task_not_found() {
        let scheduler = Scheduler::new();
        let result = scheduler.get_task("nonexistent").await;
        assert!(matches!(result, Err(SchedulerError::TaskNotFound(_))));
    }

    #[tokio::test]
    async fn active_count() {
        let scheduler = Scheduler::new();
        assert_eq!(scheduler.active_count().await, 0);

        scheduler
            .add_task(TaskDef::from_cron("0 * * * * *").unwrap())
            .await
            .unwrap();
        scheduler
            .add_task(TaskDef::from_cron("0 */2 * * * *").unwrap())
            .await
            .unwrap();
        assert_eq!(scheduler.active_count().await, 2);

        let tasks = scheduler.list_tasks().await;
        scheduler.pause_task(&tasks[0].id).await.unwrap();
        assert_eq!(scheduler.active_count().await, 1);
    }

    #[tokio::test]
    async fn callback_fires() {
        let counter = Arc::new(AtomicUsize::new(0));
        let counter_clone = counter.clone();

        let scheduler = Scheduler::new().with_callback(Arc::new(move |_task| {
            counter_clone.fetch_add(1, Ordering::SeqCst);
        }));

        // Use every-second cron
        let task = TaskDef::from_cron("* * * * * *")
            .unwrap()
            .with_max_executions(1);
        scheduler.add_task(task).await.unwrap();

        // Run scheduler briefly
        let sched = Arc::new(scheduler);
        let sched_clone = sched.clone();
        let handle = tokio::spawn(async move {
            sched_clone.start().await;
        });

        // Wait up to 3 seconds for it to fire
        time::sleep(Duration::from_secs(3)).await;
        sched.stop().await;
        handle.await.unwrap();

        assert!(counter.load(Ordering::SeqCst) >= 1);
    }
}
