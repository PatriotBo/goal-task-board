#!/usr/bin/env node
// 脱敏处理脚本：生成部署用的 data.json
// 用法：node build-sanitized.js
//
// 规则：
// 1. 理财相关任务 → outputContent 替换为脱敏占位说明
// 2. 含个人隐私的任务 → 移除敏感信息
// 3. 不宜公开的 inProgress 任务 → 移除
//
// 理财任务识别方式：
// - 硬编码 ID 列表（已知的理财任务）
// - 自动检测：goal 含"理财"/"投资"/"A/H股"/"持仓" 关键词的任务
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'kanban', 'data.json');
const dest = path.join(__dirname, 'data.json');

const data = JSON.parse(fs.readFileSync(src, 'utf8'));

// ===== 1. 理财任务识别 =====
// 已知的理财任务 ID（硬编码兜底）
const knownFinanceTasks = ['TASK-015', 'TASK-017', 'TASK-019', 'TASK-022'];

// 理财关键词自动检测
const financeKeywords = ['理财', '投资', 'A/H股', 'A股', 'H股', '持仓', '股票', '加仓', '减仓', '复盘', '收益率', '组合跟踪'];

function isFinanceTask(task) {
  if (knownFinanceTasks.includes(task.id)) return true;
  const text = `${task.title || ''} ${task.description || ''} ${task.goal || ''}`;
  return financeKeywords.some(kw => text.includes(kw));
}

// 脱敏占位内容生成
function sanitizeFinanceContent(task) {
  return `# ${task.title}\n\n> ⚠️ 该内容涉及个人投资持仓信息，已脱敏处理。\n>\n> 任务描述：${task.description || '无'}\n> 完成日期：${task.date || '未知'}\n\n---\n\n*此为脱敏版本，完整内容仅保留在本地。*`;
}

// ===== 2. 隐私信息清理规则 =====
const privacyRules = [
  { pattern: /1 岁 7 个月/g, replacement: '' },
  { pattern: /当前宝宝 ?\d+ ?岁 ?\d+ ?个月/g, replacement: '' },
];

function cleanPrivacy(content) {
  let cleaned = content;
  for (const rule of privacyRules) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }
  // 清理育儿指南中的具体个人家庭描述
  cleaned = cleaned.replace(
    /> 制定日期：\S+ \| 适用年龄：1-2 岁（[^）]*）/,
    '> 制定日期：2026-03-26 | 适用年龄：1-2 岁'
  );
  return cleaned;
}

// ===== 3. 不宜公开的 inProgress 任务 ID =====
const hiddenInProgressKeywords = ['加仓', '减仓', '建仓', '清仓', '挂单'];

function shouldHideInProgress(task) {
  if (task.id === 'TASK-025C') return true; // 硬编码兜底
  const text = `${task.title || ''} ${task.description || ''}`;
  return hiddenInProgressKeywords.some(kw => text.includes(kw));
}

// ===== 处理各列 =====
const processColumn = (tasks) => {
  if (!tasks) return tasks;
  return tasks.map(task => {
    // 理财任务：替换 outputContent
    if (isFinanceTask(task)) {
      return { ...task, outputContent: sanitizeFinanceContent(task) };
    }
    // 非理财任务：清理隐私信息
    if (task.outputContent) {
      return { ...task, outputContent: cleanPrivacy(task.outputContent) };
    }
    return task;
  });
};

if (data.columns) {
  if (data.columns.done?.tasks) {
    data.columns.done.tasks = processColumn(data.columns.done.tasks);
  }
  if (data.columns.inProgress?.tasks) {
    data.columns.inProgress.tasks = processColumn(
      data.columns.inProgress.tasks.filter(task => !shouldHideInProgress(task))
    );
  }
  if (data.columns.todo?.tasks) {
    data.columns.todo.tasks = processColumn(
      data.columns.todo.tasks.filter(task => !shouldHideInProgress(task))
    );
  }
}

fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');
console.log('✅ Sanitized data.json written to:', dest);

// ===== 验证 =====
const out = JSON.parse(fs.readFileSync(dest, 'utf8'));
const allTasks = [
  ...(out.columns.todo?.tasks || []),
  ...(out.columns.inProgress?.tasks || []),
  ...(out.columns.done?.tasks || []),
];

const financeDetected = allTasks.filter(t => isFinanceTask(t));
console.log(`检测到的理财任务: ${financeDetected.length} 个`);

const financeWithRealContent = financeDetected.filter(t => 
  t.outputContent && !t.outputContent.includes('已脱敏处理')
);
console.log(`理财任务含未脱敏 outputContent 的: ${financeWithRealContent.length} (期望 0)`);
if (financeWithRealContent.length > 0) {
  console.log('  ⚠️ 未脱敏的理财任务:', financeWithRealContent.map(t => t.id).join(', '));
}

const financeWithPlaceholder = financeDetected.filter(t => 
  t.outputContent && t.outputContent.includes('已脱敏处理')
);
console.log(`理财任务已替换为脱敏占位的: ${financeWithPlaceholder.length}`);

const hasPrivacy = allTasks.some(t => t.outputContent && /1 岁 7 个月/.test(t.outputContent));
console.log(`仍含个人隐私信息: ${hasPrivacy} (期望 false)`);

const hiddenTasks = ['TASK-025C'];
const stillVisible = hiddenTasks.filter(id => allTasks.some(t => t.id === id));
console.log(`应隐藏但仍可见的任务: ${stillVisible.length} (期望 0)`);
