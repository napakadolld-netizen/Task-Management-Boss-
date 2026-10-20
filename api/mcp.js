const { timingSafeEqual, randomUUID } = require('crypto');
const PROJECTS = ['13Enterprise', '13Education', 'DR.EV', 'EV Life Thailand', 'Delivery Drone', 'งานทั่วไป / ประสานงาน'];
const STATUSES = ['pending', 'doing', 'done'];
const PRIORITIES = ['low', 'normal', 'high'];
let ownerIdPromise;

function jsonRpc(res, id, result) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ jsonrpc: '2.0', id, result });
}
function rpcError(res, id, code, message) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ jsonrpc: '2.0', id, error: { code, message } });
}
function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
function authOk(req) {
  const expected = process.env.DAYFLOW_MCP_TOKEN;
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function sbHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}
async function ownerId() {
  if (!ownerIdPromise) ownerIdPromise = (async () => {
    const base = process.env.SUPABASE_URL;
    const email = (process.env.DAYFLOW_OWNER_EMAIL || '').trim().toLowerCase();
    if (!base || !process.env.SUPABASE_SECRET_KEY || !email) throw new Error('Vercel environment is missing Supabase or owner settings');
    const response = await fetch(`${base}/auth/v1/admin/users?page=1&perPage=1000`, { headers: sbHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Unable to look up the Dayflow account');
    const users = body.users || body;
    const user = users.find(item => (item.email || '').toLowerCase() === email);
    if (!user) throw new Error('The Dayflow account has not signed in yet. Sign in to the website once, then retry.');
    return user.id;
  })().catch(error => { ownerIdPromise = null; throw error; });
  return ownerIdPromise;
}
async function api(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...sbHeaders(), ...(options.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(body || 'Supabase request failed');
  return body ? JSON.parse(body) : null;
}
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
async function callTool(name, args = {}) {
  const userId = await ownerId();
  if (name === 'list_tasks') {
    const query = new URLSearchParams({ select: '*', user_id: `eq.${userId}`, order: 'task_date.asc' });
    if (args.project) query.set('project', `eq.${args.project}`);
    if (args.from) { if (!validDate(args.from)) throw new Error('from must be YYYY-MM-DD'); query.set('task_date', `gte.${args.from}`); }
    if (args.to) { if (!validDate(args.to)) throw new Error('to must be YYYY-MM-DD'); query.set(args.from ? 'and' : 'task_date', args.from ? `(gte.${args.from},lte.${args.to})` : `lte.${args.to}`); }
    return await api(`tasks?${query}`);
  }
  if (name === 'create_task') {
    if (!args.title || typeof args.title !== 'string') throw new Error('title is required');
    if (!PROJECTS.includes(args.project)) throw new Error(`project must be one of: ${PROJECTS.join(', ')}`);
    if (!validDate(args.date)) throw new Error('date must be YYYY-MM-DD');
    const status = args.status || 'pending', priority = args.priority || 'normal';
    if (!STATUSES.includes(status) || !PRIORITIES.includes(priority)) throw new Error('Invalid status or priority');
    if (args.parentId) { const parentQuery = new URLSearchParams({ id: `eq.${args.parentId}`, user_id: `eq.${userId}`, select: 'id' }); const parents = await api(`tasks?${parentQuery}`); if (!parents?.length) throw new Error('Parent task not found'); }
    const row = { id: randomUUID(), user_id: userId, title: args.title.trim(), notes: args.notes || '', requested_by: args.requestedBy || '', project: args.project, task_date: args.date, status, priority, completed: status === 'done' ? args.date : null };
    if (args.parentId) row.parent_id = args.parentId;
    const created = await api('tasks', { method: 'POST', body: JSON.stringify(row) });
    return created?.[0] || created;
  }
  if (name === 'update_task') {
    if (!args.id) throw new Error('id is required');
    const patch = {};
    for (const field of ['title', 'notes', 'project', 'status', 'priority']) if (args[field] !== undefined) patch[field] = args[field];
    if (args.requestedBy !== undefined) patch.requested_by = args.requestedBy;
    if (args.date !== undefined) { if (!validDate(args.date)) throw new Error('date must be YYYY-MM-DD'); patch.task_date = args.date; }
    if (args.parentId !== undefined) { if (args.parentId === args.id) throw new Error('A task cannot be its own parent'); if (args.parentId) { const parentQuery = new URLSearchParams({ id: `eq.${args.parentId}`, user_id: `eq.${userId}`, select: 'id' }); const parents = await api(`tasks?${parentQuery}`); if (!parents?.length) throw new Error('Parent task not found'); patch.parent_id = args.parentId; } else patch.parent_id = null; }
    if (patch.project && !PROJECTS.includes(patch.project)) throw new Error('Invalid project');
    if (patch.status && !STATUSES.includes(patch.status)) throw new Error('Invalid status');
    if (args.status !== undefined) patch.completed = args.status === 'done' ? (args.completed || new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)) : null;
    if (patch.priority && !PRIORITIES.includes(patch.priority)) throw new Error('Invalid priority');
    const query = new URLSearchParams({ id: `eq.${args.id}`, user_id: `eq.${userId}`, select: '*' });
    const updated = await api(`tasks?${query}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!updated?.length) throw new Error('Task not found');
    return updated[0];
  }
  if (name === 'delete_task') {
    if (!args.id) throw new Error('id is required');
    const query = new URLSearchParams({ id: `eq.${args.id}`, user_id: `eq.${userId}`, select: 'id' });
    const deleted = await api(`tasks?${query}`, { method: 'DELETE' });
    if (!deleted?.length) throw new Error('Task not found');
    return { deleted: true, id: args.id };
  }
  throw new Error(`Unknown tool: ${name}`);
}
const tools = [
  { name: 'list_tasks', description: 'List Dayflow tasks for the signed-in owner, optionally filtered by project and date range.', inputSchema: { type: 'object', properties: { project: { type: 'string', enum: PROJECTS }, from: { type: 'string', description: 'Start date YYYY-MM-DD' }, to: { type: 'string', description: 'End date YYYY-MM-DD' } } } },
  { name: 'create_task', description: 'Create a task in the owner’s Dayflow workspace.', inputSchema: { type: 'object', required: ['title', 'project', 'date'], properties: { title: { type: 'string' }, project: { type: 'string', enum: PROJECTS }, date: { type: 'string', description: 'Start date YYYY-MM-DD' }, notes: { type: 'string' }, requestedBy: { type: 'string' }, parentId: { type: 'string', description: 'Optional parent task ID for subtask nesting' }, status: { type: 'string', enum: STATUSES }, priority: { type: 'string', enum: PRIORITIES } } } },
  { name: 'update_task', description: 'Update an existing Dayflow task by its id. Call list_tasks first to find the id.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, project: { type: 'string', enum: PROJECTS }, date: { type: 'string' }, notes: { type: 'string' }, requestedBy: { type: 'string' }, parentId: { type: ['string', 'null'], description: 'Parent task ID, or null to make this a top-level task' }, status: { type: 'string', enum: STATUSES }, priority: { type: 'string', enum: PRIORITIES } } } },
  { name: 'delete_task', description: 'Delete an existing Dayflow task by its id. Call list_tasks first to confirm the task.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } }
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authOk(req)) return res.status(401).json({ error: 'Unauthorized' });
  const message = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (message.method === 'notifications/initialized') return res.status(202).end();
  if (message.method === 'initialize') return jsonRpc(res, message.id, { protocolVersion: message.params?.protocolVersion || '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'dayflow', version: '1.0.0' } });
  if (message.method === 'ping') return jsonRpc(res, message.id, {});
  if (message.method === 'tools/list') return jsonRpc(res, message.id, { tools });
  if (message.method === 'tools/call') {
    try { return jsonRpc(res, message.id, textResult(await callTool(message.params?.name, message.params?.arguments || {}))); }
    catch (error) { return jsonRpc(res, message.id, { ...textResult({ error: error.message }), isError: true }); }
  }
  return rpcError(res, message.id ?? null, -32601, 'Method not found');
};
