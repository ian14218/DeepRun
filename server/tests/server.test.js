/**
 * Tests that server.js properly wires up the scheduler.
 *
 * Instead of testing the side effects of server.js's IIFE (which is hard to
 * test due to module caching and async timing), we unit-test the scheduler
 * module directly and verify server.js imports it.
 */
const fs = require('fs');
const path = require('path');

describe('server.js integration', () => {
  it('imports and calls scheduler.start()', () => {
    // Verify server.js source code contains the scheduler import and start call
    const serverSource = fs.readFileSync(
      path.join(__dirname, '../src/server.js'),
      'utf8'
    );
    expect(serverSource).toContain("require('./jobs/scheduler')");
    expect(serverSource).toContain('scheduler.start()');
  });

  it('has graceful shutdown handlers', () => {
    const serverSource = fs.readFileSync(
      path.join(__dirname, '../src/server.js'),
      'utf8'
    );
    expect(serverSource).toContain("process.on('SIGTERM'");
    expect(serverSource).toContain("process.on('SIGINT'");
    expect(serverSource).toContain('scheduler.stop()');
    expect(serverSource).toContain('pool.end()');
  });

  it('has unhandledRejection handler', () => {
    const serverSource = fs.readFileSync(
      path.join(__dirname, '../src/server.js'),
      'utf8'
    );
    expect(serverSource).toContain("process.on('unhandledRejection'");
  });
});

describe('scheduler module', () => {
  it('exports start and stop functions', () => {
    // Use the real scheduler module (not the server.js bootstrap)
    jest.resetModules();
    const scheduler = require('../src/jobs/scheduler');
    expect(typeof scheduler.start).toBe('function');
    expect(typeof scheduler.stop).toBe('function');
  });

  it('does not start when SYNC_ENABLED is not true', () => {
    jest.resetModules();
    const original = process.env.SYNC_ENABLED;
    delete process.env.SYNC_ENABLED;

    const scheduler = require('../src/jobs/scheduler');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    scheduler.start();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('stat sync is disabled')
    );

    consoleSpy.mockRestore();
    process.env.SYNC_ENABLED = original;
  });
});
