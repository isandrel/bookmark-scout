/**
 * The Tools sidebar's long tools as actions: starting a background job (Check Dead Links,
 * Metadata Fetcher, Refresh Site Icons, Index Page Text, AI Folder Reorganization) on all
 * bookmarks or a folder, listing jobs with their progress, reading a job's results a page at a
 * time, and pausing, resuming, or cancelling one. The jobs run in the background as the sidebar's
 * do (`job-coordinator.ts`); a call in the background hands the command to the coordinator
 * (`ActionContext.jobCommand`), a page sends it there (`sendJobCommand`).
 *
 * Applying a job's reviewed changes stays with the user in the sidebar; agents change bookmarks
 * through `proposeChanges`.
 */
import { z } from 'zod';

/** Why a job command failed, for the model. */
const COMMAND_ERRORS: Record<string, ActionError> = {
  invalid: actionError('invalid_input', 'The job command was not valid.'),
  forbidden: actionError('not_allowed', 'Jobs can only be started by Bookmark Scout.'),
  'not-found': actionError('not_found', 'There is no job with this id.', {
    hint: 'Call listBackgroundJobs for the ids.',
  }),
  store: actionError('failed', 'The job could not be stored or changed.'),
};

async function command(
  context: ActionContext,
  jobCommand: JobCommand,
): Promise<JobRecord | null | ActionError> {
  const response = await (context.jobCommand ?? sendJobCommand)(jobCommand);
  return response.ok ? response.job : (COMMAND_ERRORS[response.error] ?? COMMAND_ERRORS.store);
}

const jobView = (job: JobRecord) => ({
  id: job.id,
  tool: job.kind,
  state: job.state,
  scope: job.scope.mode === 'folder' ? job.scope.label : 'all',
  total: job.total,
  done: job.done,
  createdAt: new Date(job.createdAt).toISOString(),
  ...(job.lastError ? { problem: job.lastError.message } : {}),
});

const jobOutput = z.object({
  id: z.string(),
  tool: z.string(),
  state: z.string(),
  scope: z.string().describe(agentText('job_view.scope')),
  total: z.number().int(),
  done: z.object({
    succeeded: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
  }),
  createdAt: z.string(),
  problem: z.string().optional().describe(agentText('job_view.problem')),
});

const startTool = defineAction({
  risk: 'write',
  labelKey: 'actionName_startTool',
  targets: ['library', 'folder'],
  agent: { description: agentText('start_tool.agent_description') },
  input: z.object({
    tool: z.enum(SCAN_JOB_KINDS).describe(agentText('start_tool.tool')),
    folder: z.string().min(1).optional().describe(agentText('start_tool.folder')),
  }),
  output: jobOutput,
  describe: (input) =>
    t('askAI_toolStartTool', input.tool ? jobTitle({ kind: input.tool, options: undefined }) : ''),
  approvalPreview: {
    lines: (input) => [
      t('askAI_approvalStartTool', [
        input.tool ? jobTitle({ kind: input.tool, options: undefined }) : '',
        input.folder ?? t('askAI_allBookmarks'),
      ]),
    ],
  },
  async precheck(input) {
    if (!input.folder) return undefined;
    const folder = resolveActionFolder(await loadActionLibrary(), input.folder);
    return isActionError(folder) ? folder : undefined;
  },
  async execute(input, context) {
    let scope: Extract<JobCommand, { type: 'start' }>['scope'] = { mode: 'all' };
    if (input.folder) {
      const folder = resolveActionFolder(await loadActionLibrary(), input.folder);
      if (isActionError(folder)) return folder;
      scope = { mode: 'folder', folderId: folder.node.id };
    }
    const job = await command(context, {
      type: 'start',
      commandId: crypto.randomUUID(),
      kind: input.tool,
      source: context.client.kind === 'ui' ? 'manager' : 'agent',
      scope,
    });
    if (isActionError(job)) return job;
    return job ? jobView(job) : COMMAND_ERRORS.store;
  },
});

const listBackgroundJobs = defineAction({
  risk: 'read',
  labelKey: 'actionName_listBackgroundJobs',
  targets: ['library'],
  agent: { description: agentText('list_background_jobs.agent_description') },
  input: z.object({}),
  output: z.object({ jobs: z.array(jobOutput) }),
  describe: () => t('askAI_toolListBackgroundJobs'),
  async execute() {
    return { jobs: (await listJobs()).map(jobView) };
  },
});

const getJobResults = defineAction({
  risk: 'read',
  labelKey: 'actionName_getJobResults',
  targets: ['library'],
  agent: { description: agentText('get_job_results.agent_description'), untrusted: true },
  input: z.object({
    id: z.string().min(1).describe(agentText('get_job_results.id')),
    cursor: z.string().optional().describe(agentText('cursor_input.self')),
  }),
  output: z.object({
    job: jobOutput,
    results: z.array(z.unknown()).describe(agentText('get_job_results.results')),
    total: z.number().int(),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolGetJobResults'),
  async execute(input) {
    const job = await getJob(input.id);
    if (!job) return COMMAND_ERRORS['not-found'];
    const page = pageOf(await readJobResults(job.id), input.cursor, actionLimits.max_results);
    if (isActionError(page)) return page;
    return {
      job: jobView(job),
      results: page.items,
      total: page.total,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

/** One of the commands that steer a job by its id. */
function steerJob(
  type: 'pause' | 'resume' | 'cancel',
  description: string,
  labelKey: MessageKey,
  stepKey: MessageKey,
) {
  return defineAction({
    risk: 'write',
    labelKey,
    targets: ['library'],
    agent: { description },
    input: z.object({ id: z.string().min(1).describe(agentText('get_job_results.id')) }),
    output: jobOutput,
    describe: () => t(stepKey),
    async precheck(input) {
      return (await getJob(input.id)) ? undefined : COMMAND_ERRORS['not-found'];
    },
    async execute(input, context) {
      const job = await command(context, { type, jobId: input.id });
      if (isActionError(job)) return job;
      return job ? jobView(job) : COMMAND_ERRORS['not-found'];
    },
  });
}

export const JOB_ACTIONS = {
  startTool,
  listBackgroundJobs,
  getJobResults,
  pauseJob: steerJob(
    'pause',
    agentText('steer_job.pause'),
    'actionName_pauseJob',
    'askAI_toolPauseJob',
  ),
  resumeJob: steerJob(
    'resume',
    agentText('steer_job.resume'),
    'actionName_resumeJob',
    'askAI_toolResumeJob',
  ),
  cancelJob: steerJob(
    'cancel',
    agentText('steer_job.cancel'),
    'actionName_cancelJob',
    'askAI_toolCancelJob',
  ),
};
