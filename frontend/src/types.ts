export interface EpisodeSummary {
  episode_id: number;
  num_frames: number;
  success: boolean;
  max_reward: number;
  dirty?: boolean;
}

export interface DatasetLoadResponse {
  dataset_dir: string;
  total_episodes: number;
  total_frames: number;
  fps: number;
  task: string;
  image_columns: string[];
  has_improvement_col: boolean;
  has_success_col: boolean;
  episodes: EpisodeSummary[];
}

export interface EpisodeDetail {
  episode_id: number;
  num_frames: number;
  success: boolean;
  max_reward: number;
  image_columns: string[];
  improvement: number[];
  dirty: boolean;
}

export interface ImprovementResponse {
  improvement: number[];
  dirty: boolean;
}
