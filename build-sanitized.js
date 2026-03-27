#!/usr/bin/env node
// 脱敏处理脚本：生成部署用的 data.json
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'kanban', 'data.json');
const dest = path.join(__dirname, 'data.json');

const data = JSON.parse(fs.readFileSync(src, 'utf8'));

// 理财相关任务 ID — 方案 B：保留标题描述，清空 outputContent
const financeTasks = ['TASK-015', 'TASK-017', 'TASK-019', 'TASK-022'];

// 处理 done 列
if (data.columns && data.columns.done && data.columns.done.tasks) {
  data.columns.done.tasks = data.columns.done.tasks.map(task => {
    // 理财任务：替换 outputContent 为脱敏说明（而非删除，避免前端报"无法加载"）
    if (financeTasks.includes(task.id)) {
      return {
        ...task,
        outputContent: `# ${task.title}\n\n> ⚠️ 该内容涉及个人投资持仓信息，已脱敏处理。\n>\n> 任务描述：${task.description || '无'}\n> 完成日期：${task.date || '未知'}\n\n---\n\n*此为脱敏版本，完整内容仅保留在本地。*`
      };
    }

    // 育儿指南 TASK-020：保留但删除开头的个人家庭描述
    if (task.id === 'TASK-020' && task.outputContent) {
      let content = task.outputContent;
      // 删除 "适用年龄" 行中的具体信息
      content = content.replace(
        /> 制定日期：\S+ \| 适用年龄：1-2 岁（当前宝宝 1 岁 7 个月）/,
        '> 制定日期：2026-03-26 | 适用年龄：1-2 岁'
      );
      return { ...task, outputContent: content };
    }

    return task;
  });
}

// 处理 inProgress 列 — 移除 TASK-025C（核电加仓执行）
if (data.columns && data.columns.inProgress && data.columns.inProgress.tasks) {
  data.columns.inProgress.tasks = data.columns.inProgress.tasks.filter(
    task => task.id !== 'TASK-025C'
  );
}

fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');
console.log('✅ Sanitized data.json written to:', dest);

// 验证
const out = JSON.parse(fs.readFileSync(dest, 'utf8'));
const allTasks = [
  ...(out.columns.todo?.tasks || []),
  ...(out.columns.inProgress?.tasks || []),
  ...(out.columns.done?.tasks || []),
];

const financeWithRealContent = allTasks.filter(t => 
  financeTasks.includes(t.id) && t.outputContent && !t.outputContent.includes('已脱敏处理')
);
console.log(`理财任务含未脱敏 outputContent 的: ${financeWithRealContent.length} (期望 0)`);
const financeWithPlaceholder = allTasks.filter(t => 
  financeTasks.includes(t.id) && t.outputContent && t.outputContent.includes('已脱敏处理')
);
console.log(`理财任务已替换为脱敏占位的: ${financeWithPlaceholder.length} (期望 ${financeTasks.length})`);

const task020 = allTasks.find(t => t.id === 'TASK-020');
if (task020 && task020.outputContent) {
  const hasPersonalInfo = task020.outputContent.includes('1 岁 7 个月');
  console.log(`育儿指南仍含个人信息: ${hasPersonalInfo} (期望 false)`);
}

const task025c = allTasks.find(t => t.id === 'TASK-025C');
console.log(`TASK-025C 已移除: ${!task025c} (期望 true)`);
