import type { AuditEntry as Lab3AuditEntry } from '../audit/types.js';

export type Lab1AuditEntry = {
  timestamp: string;
  method: string;
  path: string;
  actor: string;
  request: Record<string, unknown>;
  status: number;
};

export type TimelineEvent = {
  timestamp: string;
  source: 'lab3' | 'lab1';
  label: string;
  detail: string;
};

export type CascadeTimelineInput = {
  lab3Path: string;
  lab1Path: string;
  userEmail: string;
  oktaUserId?: string;
};

export type CascadeTimelineResult = {
  userEmail: string;
  oktaUserId: string;
  events: TimelineEvent[];
  cascadeLatencySeconds: number | null;
  lab3RevokeApproved: Lab3AuditEntry;
  lab1Deprovision: Lab1AuditEntry;
};

export type CascadeTimelineJson = {
  user: string;
  oktaUserId: string;
  cascadeLatencySeconds: number | null;
  events: TimelineEvent[];
  lab3RevokeApproved: Lab3AuditEntry;
  lab1Deprovision: Lab1AuditEntry;
};
