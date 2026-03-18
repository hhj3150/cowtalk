// Intelligence Loop — 모듈 re-export

export { collectFeedback, getFeedbackByAnimal, getFeedbackByPrediction, getFeedbackStats } from './feedback-collector.js';
export { recordOutcome, matchPredictionToOutcome, runBatchMatching, getUnmatchedPredictions } from './outcome-recorder.js';
export { evaluateEngine, evaluateByRole, getAccuracyTrend, compareEngines } from './model-evaluator.js';
export { analyzeThresholds, getThresholdHistory } from './threshold-learner.js';
export { registerVersion, getActiveVersion, compareVersions, getVersionHistory } from './model-registry.js';
export { processEvent, processBatchEvents, processUnprocessedEvents } from './event-processor.js';
