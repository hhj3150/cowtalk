// 전염병 조기경보 모듈 진입점

export {
  haversineDistance,
  findFarmsWithinRadius,
  calculateClusterCenter,
  calculateClusterRadius,
  type FarmWithCoordinates,
  type FarmWithDistance,
} from './geo-utils.js';

export {
  detectClusters,
  aggregateEventsByFarm,
  isEpidemicRelevantEvent,
  type DetectedCluster,
  type ClusterFarm,
  type FarmEventAggregate,
  type HealthEventRecord,
} from './cluster-detector.js';

export {
  assessProximityRisk,
  predictSpread,
  buildClusterTrend,
  clusterToSnapshot,
} from './spread-analyzer.js';

export {
  insertCluster,
  updateCluster,
  getActiveClusters,
  getClusterFarms,
  resolveCluster,
  createWarning,
  getActiveWarnings,
  acknowledgeWarning,
  upsertDailySnapshot,
  getDailySnapshots,
} from './cluster-repository.js';
