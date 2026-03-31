#!/usr/bin/env bash
# sync-kanban.sh — Kanban 校验 + 脱敏构建 + GitHub 自动同步
# 用法：bash kanban-deploy/sync-kanban.sh
# 从项目根目录运行，或脚本会自动切换到正确目录

set -euo pipefail

# === 路径设置 ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
KANBAN_DIR="$PROJECT_ROOT/kanban"
DEPLOY_DIR="$SCRIPT_DIR"
DATA_JSON="$KANBAN_DIR/data.json"
DEPLOY_JSON="$DEPLOY_DIR/data.json"

echo "=========================================="
echo "  Kanban 校验 + 同步脚本"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# === Step 1: 检查源文件存在 ===
echo ""
echo "📋 Step 1: 检查源文件..."
if [ ! -f "$DATA_JSON" ]; then
  echo "❌ 错误: kanban/data.json 不存在！"
  exit 1
fi
echo "✅ kanban/data.json 存在 ($(wc -c < "$DATA_JSON" | tr -d ' ') bytes)"

# === Step 2: JSON 语法校验 ===
echo ""
echo "🔍 Step 2: JSON 语法校验..."
if ! python3 -c "
import json, sys
try:
    with open('$DATA_JSON') as f:
        data = json.load(f)
    # 结构完整性校验
    assert 'columns' in data, '缺少 columns 字段'
    assert 'todo' in data['columns'], '缺少 todo 列'
    assert 'inProgress' in data['columns'], '缺少 inProgress 列'
    assert 'done' in data['columns'], '缺少 done 列'
    
    todo = len(data['columns']['todo'].get('tasks', []))
    prog = len(data['columns']['inProgress'].get('tasks', []))
    done = len(data['columns']['done'].get('tasks', []))
    total = todo + prog + done
    
    print(f'  todo: {todo} | inProgress: {prog} | done: {done} | 总计: {total}')
    
    if total == 0:
        print('⚠️  警告: 任务总数为 0，可能数据有问题')
        sys.exit(2)
    
    # 检查 done 任务的 outputContent
    done_tasks = data['columns']['done'].get('tasks', [])
    missing_output = [t['id'] for t in done_tasks if t.get('output') and not t.get('outputContent')]
    if missing_output:
        print(f'⚠️  警告: {len(missing_output)} 个 done 任务有 output 但缺少 outputContent: {missing_output}')
    
    print('✅ JSON 结构完整，校验通过')
except json.JSONDecodeError as e:
    print(f'❌ JSON 语法错误: {e}')
    sys.exit(1)
except AssertionError as e:
    print(f'❌ 结构校验失败: {e}')
    sys.exit(1)
"; then
  echo "❌ kanban/data.json 校验失败！中止同步。"
  echo "请先修复 data.json 再运行此脚本。"
  exit 1
fi

# === Step 3: 运行脱敏构建 ===
echo ""
echo "🔒 Step 3: 运行脱敏构建..."
cd "$PROJECT_ROOT"
if ! node kanban-deploy/build-sanitized.js; then
  echo "❌ 脱敏构建失败！"
  exit 1
fi

# === Step 4: 校验脱敏后文件 ===
echo ""
echo "🔍 Step 4: 校验脱敏后文件..."
python3 -c "
import json
with open('$DEPLOY_JSON') as f:
    data = json.load(f)
all_tasks = (
    data['columns']['todo'].get('tasks', []) +
    data['columns']['inProgress'].get('tasks', []) +
    data['columns']['done'].get('tasks', [])
)
# 检查理财内容是否已脱敏
finance_kw = ['理财', '投资', 'A/H股', 'A股', 'H股', '持仓', '股票', '加仓', '减仓', '复盘', '收益率', '组合跟踪']
for t in all_tasks:
    text = f\"{t.get('title','')} {t.get('description','')} {t.get('goal','')}\"
    is_finance = any(kw in text for kw in finance_kw)
    if is_finance and t.get('outputContent') and '已脱敏处理' not in t['outputContent']:
        print(f'⚠️  理财任务 {t[\"id\"]} 的 outputContent 未脱敏！')
print('✅ 脱敏校验通过')
"

# === Step 5: Git 提交 + 推送 ===
echo ""
echo "🚀 Step 5: Git 提交并推送到 GitHub..."
cd "$DEPLOY_DIR"

# 检查是否有变更
if git diff --quiet && git diff --cached --quiet; then
  echo "ℹ️  没有变更，无需推送。"
  echo "=========================================="
  echo "✅ 同步完成（无变更）"
  echo "=========================================="
  exit 0
fi

git add -A
COMMIT_MSG="sync: kanban data $(date '+%Y-%m-%d %H:%M')"
git commit -m "$COMMIT_MSG"
git push origin main

echo ""
echo "=========================================="
echo "✅ 同步完成！"
echo "  提交信息: $COMMIT_MSG"
echo "  GitHub Pages 将在 1-2 分钟内更新"
echo "=========================================="
