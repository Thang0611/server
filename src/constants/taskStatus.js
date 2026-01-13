/**
 * DownloadTask status constants and helpers
 * @module constants/taskStatus
 */

// Task status values
const TASK_STATUS = {
  // Task created, awaiting payment confirmation
  PENDING: 'pending',
  
  // Payment confirmed, ready for enrollment
  PROCESSING: 'processing',
  
  // Enrolled in Udemy, ready for download  
  ENROLLED: 'enrolled',
  
  // Download and upload complete
  COMPLETED: 'completed',
  
  // Error at any stage
  FAILED: 'failed',
  
  // @deprecated - DO NOT USE IN NEW CODE
  // Kept for backward compatibility only
  // Use PENDING instead
  PAID: 'paid'
};

// Task statuses that indicate work is still in progress
const IN_PROGRESS_STATUSES = [
  TASK_STATUS.PENDING,      // Waiting for payment
  TASK_STATUS.PROCESSING,   // Ready for enrollment
  TASK_STATUS.ENROLLED      // Ready for download
];

// Task statuses that indicate work is complete (success or failure)
const FINAL_STATUSES = [
  TASK_STATUS.COMPLETED,
  TASK_STATUS.FAILED
];

// Status that worker accepts for processing
const PROCESSABLE_STATUS = TASK_STATUS.PROCESSING;

/**
 * Checks if a status indicates task is still in progress
 * @param {string} status - Task status
 * @returns {boolean}
 */
const isInProgress = (status) => {
  return IN_PROGRESS_STATUSES.includes(status);
};

/**
 * Checks if a status indicates task is complete
 * @param {string} status - Task status
 * @returns {boolean}
 */
const isFinal = (status) => {
  return FINAL_STATUSES.includes(status);
};

/**
 * Checks if a task can be processed by worker
 * @param {string} status - Task status
 * @returns {boolean}
 */
const isProcessable = (status) => {
  return status === PROCESSABLE_STATUS;
};

module.exports = {
  TASK_STATUS,
  IN_PROGRESS_STATUSES,
  FINAL_STATUSES,
  PROCESSABLE_STATUS,
  isInProgress,
  isFinal,
  isProcessable
};
