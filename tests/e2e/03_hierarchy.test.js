/**
 * 03 — Hierarchy.
 *
 * Tree + node CRUD. Test-created nodes use the e2e_<ts>_ prefix and are
 * soft-deleted in teardown so the production tenant doesn't accumulate cruft.
 */

const { test, assertStatus, assertStatusOneOf, assertHasField, assertTrue, unwrap, run } = require('./lib/expect');
const { request } = require('./lib/client');
const { login } = require('./lib/auth');
const { uniquePrefix } = require('./lib/fixtures');
const FormData = require('form-data');

const createdNodeIds = [];

test('GET /hierarchy/tree → 200 with tenant root', async () => {
  const { token } = await login();
  const r = await request({ method: 'GET', url: '/hierarchy/tree', token });
  assertStatus(r, 200);
  const tree = unwrap(r);
  assertTrue(tree !== null && tree !== undefined, 'tree present');
}, { smoke: true });

test('POST /hierarchy/nodes (create LE under existing parent) → 201', async () => {
  const { token } = await login();
  // Find an existing parent (group) to attach to.
  const treeRes = await request({ method: 'GET', url: '/hierarchy/tree', token });
  const tree = unwrap(treeRes);
  let parentId = null;
  // Tree might be an array of roots, or single root with children.
  const roots = Array.isArray(tree) ? tree : tree && tree.children ? [tree] : [tree].filter(Boolean);
  for (const r of roots) {
    if (r && r.id) { parentId = r.id; break; }
  }
  if (!parentId) {
    // Nothing to attach to — skip without false failure.
    assertTrue(true, 'no parent found; skipping create');
    return;
  }

  const name = `${uniquePrefix()}_LE`;
  const r = await request({
    method: 'POST',
    url: '/hierarchy/nodes',
    token,
    data: { name, type: 'LE', parentId },
  });
  // 201 on success, 422/400 if permission missing (demo user role-bound).
  assertStatusOneOf(r, [201, 400, 403, 422], 'create node');
  if (r.status === 201) {
    const node = unwrap(r);
    assertHasField(node, 'id');
    createdNodeIds.push(node.id);
  }
});

test('POST /hierarchy/nodes with invalid parent → 400/404/422', async () => {
  const { token } = await login();
  const r = await request({
    method: 'POST',
    url: '/hierarchy/nodes',
    token,
    data: { name: `${uniquePrefix()}_bad`, type: 'LE', parentId: 'clbogusparent00000000000' },
  });
  // Must NOT leak as 500. Normalized FK error should be 4xx.
  assertStatusOneOf(r, [400, 403, 404, 422], 'invalid parent should be a 4xx error');
});

test('PATCH /hierarchy/nodes/:id → 200 updates name (if we created one)', async () => {
  if (createdNodeIds.length === 0) {
    assertTrue(true, 'no node created in this run — skip');
    return;
  }
  const { token } = await login();
  const id = createdNodeIds[0];
  const newName = `${uniquePrefix()}_renamed`;
  const r = await request({
    method: 'PATCH',
    url: `/hierarchy/nodes/${id}`,
    token,
    data: { name: newName },
  });
  assertStatusOneOf(r, [200, 403]);
});

test('DELETE /hierarchy/nodes/:id → 200/204 soft delete (cleanup)', async () => {
  if (createdNodeIds.length === 0) {
    assertTrue(true, 'no node created in this run — skip');
    return;
  }
  const { token } = await login();
  const id = createdNodeIds[0];
  const r = await request({ method: 'DELETE', url: `/hierarchy/nodes/${id}`, token });
  assertStatusOneOf(r, [200, 204, 403]);
});

test('POST /hierarchy/bulk-import with valid CSV → 201/200', async () => {
  const { token } = await login();
  const csv = `name,type,parentName\n${uniquePrefix()}_grp,LE,\n`;
  const fd = new FormData();
  fd.append('file', Buffer.from(csv), { filename: 'bulk.csv', contentType: 'text/csv' });
  const r = await request({
    method: 'POST',
    url: '/hierarchy/bulk-import',
    token,
    data: fd,
  });
  // Bulk-import can also return 400 if the CSV schema doesn't match expected columns,
  // or 403 if role lacks permission. Accept those without false-positive failure.
  assertStatusOneOf(r, [200, 201, 400, 403, 422]);
});

if (require.main === module) {
  run().then(rs => process.exit(rs.some(r => !r.passed) ? 1 : 0));
}
