/**
 * 模板地址映射表守护测试
 * 三条断言：
 * 1. 每条 relPath 文件存在
 * 2. 与 effectiveDesignDocs 双向一致，禁用组合无表项
 * 3. templates/ 下未引用文件必须在 allowlist
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { NODE_TEMPLATES } from '../src/domain/template/registry';

const TEMPLATES_DIR = resolve(__dirname, '../templates');

describe('模板地址映射表守护单测', () => {
  describe('路径存在性校验', () => {
    it('每条 relPath 必须 existsSync', () => {
      const allPaths: string[] = [];
      
      NODE_TEMPLATES.forEach(entry => {
        const { templates } = entry;
        if (templates.requirement) allPaths.push(templates.requirement.relPath);
        // REQ-261005105032-3b02 t11：原型骨架也是登记在册的模板，与其它 relPath 同一口径校验
        if (templates.prototype) allPaths.push(templates.prototype.relPath);
        if (templates.decomposition) allPaths.push(templates.decomposition.relPath);
        if (templates.taskCard) allPaths.push(templates.taskCard.relPath);
        if (templates.testEvidence) allPaths.push(templates.testEvidence.relPath);
        if (templates.review) allPaths.push(templates.review.relPath);
        if (templates.verification) allPaths.push(templates.verification.relPath);
        if (templates.archiveIndex) allPaths.push(templates.archiveIndex.relPath);
        if (templates.retro) allPaths.push(templates.retro.relPath);
        if (templates.designDocs) {
          templates.designDocs.forEach(doc => allPaths.push(doc.relPath));
        }
      });

      const missingFiles: string[] = [];
      allPaths.forEach(relPath => {
        const fullPath = resolve(TEMPLATES_DIR, relPath);
        if (!existsSync(fullPath)) {
          missingFiles.push(relPath);
        }
      });

      expect(
        missingFiles,
        `缺失的模板文件: ${missingFiles.join(', ')}`
      ).toEqual([]);
    });
  });

  describe('与 effectiveDesignDocs 双向一致性', () => {
    it('feature 类需求应返回 5 个设计文档', () => {
      const entry = NODE_TEMPLATES.find(e => e.stage === 'design' && e.category === 'feature');
      expect(entry, 'feature design 表项必须存在').toBeDefined();
      expect(entry!.templates.designDocs).toHaveLength(5);
      
      const docNames = entry!.templates.designDocs!.map(d => 
        d.relPath.replace('design/', '').replace('.md', '')
      );
      expect(docNames.sort()).toEqual([
        'architecture', 'data-model', 'interfaces', 'test-cases', 'use-cases'
      ].sort());
    });

    it('refactor 类需求应返回 2 个设计文档', () => {
      const entry = NODE_TEMPLATES.find(e => e.stage === 'design' && e.category === 'refactor');
      expect(entry, 'refactor design 表项必须存在').toBeDefined();
      expect(entry!.templates.designDocs).toHaveLength(2);
      
      const docNames = entry!.templates.designDocs!.map(d => 
        d.relPath.replace('design/', '').replace('.md', '')
      );
      expect(docNames.sort()).toEqual(['architecture', 'migration'].sort());
    });

    it('bug 类需求不应有 design 表项', () => {
      const entry = NODE_TEMPLATES.find(e => e.stage === 'design' && e.category === 'bug');
      expect(entry, 'bug 不走 design，应该无表项').toBeUndefined();
    });
  });

  describe('templates/ 下未引用文件检查', () => {
    it('未引用文件必须在显式 allowlist', () => {
      // 收集所有引用的文件
      const referencedFiles = new Set<string>();
      NODE_TEMPLATES.forEach(entry => {
        const { templates } = entry;
        if (templates.requirement) referencedFiles.add(templates.requirement.relPath);
        if (templates.prototype) referencedFiles.add(templates.prototype.relPath);
        if (templates.decomposition) referencedFiles.add(templates.decomposition.relPath);
        if (templates.taskCard) referencedFiles.add(templates.taskCard.relPath);
        if (templates.testEvidence) referencedFiles.add(templates.testEvidence.relPath);
        if (templates.review) referencedFiles.add(templates.review.relPath);
        if (templates.verification) referencedFiles.add(templates.verification.relPath);
        if (templates.archiveIndex) referencedFiles.add(templates.archiveIndex.relPath);
        if (templates.retro) referencedFiles.add(templates.retro.relPath);
        if (templates.designDocs) {
          templates.designDocs.forEach(doc => referencedFiles.add(doc.relPath));
        }
      });

      // 允许列表（非节点模板，如 README/examples/backend/frontend）
      const allowlist = [
        '.DS_Store',
        'README.md',
        'common/notes.md',
        'design/backend.md',    // backend 专属，非门禁必须
        'design/frontend.md',   // frontend 专属，非门禁必须
        // REQ-261005105032-3b02 t11：原型骨架已 `git mv` 到 brainstorming/ 并**登记进 registry**
        // （NodeTemplateEntry.templates.prototype），故不再需要 allowlist 豁免；旧路径
        // design/prototype.html 已不存在，旧条目一并删除。
        // 下面两条是**基线缺陷修复**（t11 顺带，非本卡改动面）：它们在本卡开工前的 HEAD 上就已经
        // 未被引用却也没进 allowlist（f3c99c8 / 2da57d6 加进来的），该用例因此长期红。
        // 处置取**显式声明**而不是让它们静默漏过（本条断言的语义就是"没引用就必须有人认领"）。
        'brainstorming/feature-example.md', // 教学用成品示例，非任何节点的门禁模板（R1 归 example 类）
        'TEMPLATE-IMPROVEMENTS.md',         // 模板改进记录，人读文档
      ];

      // 递归扫描 templates/ 目录
      function scanDir(dir: string, prefix = ''): string[] {
        const entries = readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        entries.forEach(entry => {
          if (entry.name.startsWith('.') && entry.name !== '.DS_Store') return; // 跳过隐藏文件（.DS_Store 除外）
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            files.push(...scanDir(resolve(dir, entry.name), relPath));
          } else {
            files.push(relPath);
          }
        });
        return files;
      }

      const allFiles = scanDir(TEMPLATES_DIR);
      const unreferencedFiles = allFiles.filter(f => 
        !referencedFiles.has(f) && 
        !allowlist.includes(f) &&
        !f.startsWith('examples/') // examples 整体豁免
      );

      expect(
        unreferencedFiles,
        `以下文件未被引用且不在 allowlist：${unreferencedFiles.join(', ')}`
      ).toEqual([]);
    });
  });

  describe('relPath 安全性校验', () => {
    it('relPath 必须拒绝 ..（路径穿越）', () => {
      const allPaths: string[] = [];
      NODE_TEMPLATES.forEach(entry => {
        const { templates } = entry;
        if (templates.requirement) allPaths.push(templates.requirement.relPath);
        // REQ-261005105032-3b02 t11：原型骨架也是登记在册的模板，与其它 relPath 同一口径校验
        if (templates.prototype) allPaths.push(templates.prototype.relPath);
        if (templates.decomposition) allPaths.push(templates.decomposition.relPath);
        if (templates.taskCard) allPaths.push(templates.taskCard.relPath);
        if (templates.testEvidence) allPaths.push(templates.testEvidence.relPath);
        if (templates.review) allPaths.push(templates.review.relPath);
        if (templates.verification) allPaths.push(templates.verification.relPath);
        if (templates.archiveIndex) allPaths.push(templates.archiveIndex.relPath);
        if (templates.retro) allPaths.push(templates.retro.relPath);
        if (templates.designDocs) {
          templates.designDocs.forEach(doc => allPaths.push(doc.relPath));
        }
      });

      const unsafePaths = allPaths.filter(p => p.includes('..'));
      expect(unsafePaths, '存在路径穿越风险').toEqual([]);
    });

    it('relPath 必须拒绝绝对路径', async () => {
      const { isAbsolute } = await import('path');
      const allPaths: string[] = [];
      NODE_TEMPLATES.forEach(entry => {
        const { templates } = entry;
        if (templates.requirement) allPaths.push(templates.requirement.relPath);
        // REQ-261005105032-3b02 t11：原型骨架也是登记在册的模板，与其它 relPath 同一口径校验
        if (templates.prototype) allPaths.push(templates.prototype.relPath);
        if (templates.decomposition) allPaths.push(templates.decomposition.relPath);
        if (templates.taskCard) allPaths.push(templates.taskCard.relPath);
        if (templates.testEvidence) allPaths.push(templates.testEvidence.relPath);
        if (templates.review) allPaths.push(templates.review.relPath);
        if (templates.verification) allPaths.push(templates.verification.relPath);
        if (templates.archiveIndex) allPaths.push(templates.archiveIndex.relPath);
        if (templates.retro) allPaths.push(templates.retro.relPath);
        if (templates.designDocs) {
          templates.designDocs.forEach(doc => allPaths.push(doc.relPath));
        }
      });

      const absolutePaths = allPaths.filter(p => isAbsolute(p));
      expect(absolutePaths, '存在绝对路径').toEqual([]);
    });

    it('relPath 必须拒绝空串', () => {
      const allPaths: string[] = [];
      NODE_TEMPLATES.forEach(entry => {
        const { templates } = entry;
        if (templates.requirement) allPaths.push(templates.requirement.relPath);
        // REQ-261005105032-3b02 t11：原型骨架也是登记在册的模板，与其它 relPath 同一口径校验
        if (templates.prototype) allPaths.push(templates.prototype.relPath);
        if (templates.decomposition) allPaths.push(templates.decomposition.relPath);
        if (templates.taskCard) allPaths.push(templates.taskCard.relPath);
        if (templates.testEvidence) allPaths.push(templates.testEvidence.relPath);
        if (templates.review) allPaths.push(templates.review.relPath);
        if (templates.verification) allPaths.push(templates.verification.relPath);
        if (templates.archiveIndex) allPaths.push(templates.archiveIndex.relPath);
        if (templates.retro) allPaths.push(templates.retro.relPath);
        if (templates.designDocs) {
          templates.designDocs.forEach(doc => allPaths.push(doc.relPath));
        }
      });

      const emptyPaths = allPaths.filter(p => !p || p.trim() === '');
      expect(emptyPaths, '存在空路径').toEqual([]);
    });
  });
});
