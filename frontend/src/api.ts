import type {
  DatasetLoadResponse,
  EpisodeSummary,
  EpisodeDetail,
  ImprovementResponse,
} from './types';

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export function loadDataset(datasetDir: string): Promise<DatasetLoadResponse> {
  return request('/dataset/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_dir: datasetDir }),
  });
}

export function listEpisodes(): Promise<EpisodeSummary[]> {
  return request('/episodes');
}

export function getEpisode(id: number): Promise<EpisodeDetail> {
  return request(`/episode/${id}`);
}

export function frameUrl(episodeId: number, frameIdx: number, camera = 'image'): string {
  return `/episode/${episodeId}/frame/${frameIdx}?camera=${encodeURIComponent(camera)}`;
}

export function updateImprovement(
  episodeId: number,
  payload: { start: number; end: number; value: number } | { set_all: number } | { copy_human_input: boolean },
): Promise<ImprovementResponse> {
  return request(`/episode/${episodeId}/improvement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function saveEpisode(episodeId: number): Promise<{ status: string }> {
  return request(`/episode/${episodeId}/save`, { method: 'POST' });
}

export function resetEpisode(episodeId: number): Promise<ImprovementResponse> {
  return request(`/episode/${episodeId}/reset`, { method: 'POST' });
}
