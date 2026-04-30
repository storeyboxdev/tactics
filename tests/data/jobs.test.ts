import { describe, it, expect } from 'vitest';
import { JOB_DEFS } from '../../src/data/jobs';
import { ABILITIES } from '../../src/data/abilities';

describe('JOB_DEFS catalog', () => {
  it('contains at least 20 jobs', () => {
    expect(Object.keys(JOB_DEFS).length).toBeGreaterThanOrEqual(20);
  });

  it('every prereq jobId references a defined job', () => {
    for (const job of Object.values(JOB_DEFS)) {
      for (const p of job.prereqs) {
        expect(JOB_DEFS[p.jobId], `${job.id} references unknown prereq ${p.jobId}`).toBeDefined();
        expect(p.level).toBeGreaterThan(0);
      }
    }
  });

  it('the prereq graph is acyclic', () => {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map<string, number>();
    function dfs(id: string, trail: string[]) {
      const c = color.get(id) ?? WHITE;
      if (c === GREY) throw new Error(`cycle: ${[...trail, id].join(' → ')}`);
      if (c === BLACK) return;
      color.set(id, GREY);
      for (const p of JOB_DEFS[id].prereqs) dfs(p.jobId, [...trail, id]);
      color.set(id, BLACK);
    }
    expect(() => {
      for (const id of Object.keys(JOB_DEFS)) dfs(id, []);
    }).not.toThrow();
  });

  it('squire and chemist are root jobs (no prereqs)', () => {
    expect(JOB_DEFS.squire.prereqs).toEqual([]);
    expect(JOB_DEFS.chemist.prereqs).toEqual([]);
  });

  it('every learnableActives entry references a defined ability', () => {
    for (const job of Object.values(JOB_DEFS)) {
      for (const id of job.learnableActives) {
        expect(ABILITIES[id], `${job.id} learns unknown ability ${id}`).toBeDefined();
      }
    }
  });

  it('the four MVP jobs are reachable and have abilities defined where applicable', () => {
    expect(JOB_DEFS.squire).toBeDefined();
    expect(JOB_DEFS.chemist).toBeDefined();
    expect(JOB_DEFS.knight.learnableActives).toContain('power_break');
    expect(JOB_DEFS.knight.learnableActives).toContain('speed_break');
    expect(JOB_DEFS.black_mage.learnableActives).toEqual(['fire', 'bolt', 'ice']);
  });

  it('Mime requires every other generic job (deepest unlock)', () => {
    const required = new Set(JOB_DEFS.mime.prereqs.map(p => p.jobId));
    // sample a few key jobs that should be required for Mime
    for (const id of ['squire', 'chemist', 'knight', 'archer', 'monk', 'thief', 'white_mage', 'black_mage']) {
      expect(required.has(id), `Mime should require ${id}`).toBe(true);
    }
  });
});
