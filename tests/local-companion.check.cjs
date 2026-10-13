const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
test('local companion restricts models, payloads, Host, Origin, CSRF and upstream destinations', () => {
    const result=spawnSync('python3',['tests/local_companion_checks.py'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr || result.stdout);
});
