#!/usr/bin/env node
import { runPreflightCli } from '../src/cascade/preflight.js';
import {
  correlateCascade,
  formatTimelineHuman,
  toTimelineJson,
  CascadeTimelineError,
} from '../src/cascade/timeline.js';

type TimelineCliArgs = {
  lab3: string;
  lab1: string;
  user: string;
  oktaId?: string;
  json: boolean;
};

function parseTimelineArgs(argv: string[]): TimelineCliArgs {
  let lab3 = '';
  let lab1 = '';
  let user = '';
  let oktaId: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--lab3' && argv[i + 1]) {
      lab3 = argv[++i];
    } else if (arg === '--lab1' && argv[i + 1]) {
      lab1 = argv[++i];
    } else if (arg === '--user' && argv[i + 1]) {
      user = argv[++i];
    } else if (arg === '--okta-id' && argv[i + 1]) {
      oktaId = argv[++i];
    } else if (arg === '--json') {
      json = true;
    }
  }

  if (!lab3 || !lab1 || !user) {
    throw new Error(
      'usage: cascade timeline --lab3 <path> --lab1 <path> --user <email> [--okta-id <id>] [--json]',
    );
  }

  return { lab3, lab1, user, oktaId, json };
}

async function runTimeline(argv: string[]): Promise<void> {
  const args = parseTimelineArgs(argv);
  try {
    const result = await correlateCascade({
      lab3Path: args.lab3,
      lab1Path: args.lab1,
      userEmail: args.user,
      oktaUserId: args.oktaId,
    });
    if (args.json) {
      console.log(JSON.stringify(toTimelineJson(result), null, 2));
    } else {
      console.log(formatTimelineHuman(result));
    }
  } catch (err: unknown) {
    if (err instanceof CascadeTimelineError) {
      console.error('[cascade:timeline] ' + err.message);
      process.exit(1);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const subcommand = process.argv[2];
  const rest = process.argv.slice(3);

  if (subcommand === 'preflight') {
    await runPreflightCli();
    return;
  }
  if (subcommand === 'timeline') {
    await runTimeline(rest);
    return;
  }

  console.error('usage: cascade <preflight|timeline> [args]');
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('[cascade] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
