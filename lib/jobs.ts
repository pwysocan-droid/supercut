import { JobStatus } from './types';

// Attach to globalThis so the store survives Next.js hot reloads in dev
const g = globalThis as typeof globalThis & { __supercut_jobs?: Map<string, JobStatus> };
if (!g.__supercut_jobs) g.__supercut_jobs = new Map<string, JobStatus>();
export const jobs: Map<string, JobStatus> = g.__supercut_jobs;
