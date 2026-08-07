# 知识库在线查看与版本化编辑实施流程

> 状态：代码完成（迁移待应用）
>
> 范围：管理员知识库管理、文档草稿、版本发布、原文查看、RAG 索引切换
>
> 原则：原件不可变、草稿不影响线上检索、索引成功后才切换发布版本。

## 1. 目标与边界

### 目标

- 管理员可以在线查看知识库文档的规范化正文。
- TXT / Markdown 文档可直接编辑；PDF、DOCX、图片等原件保留，只编辑其解析得到的 Markdown 文本。
- 保存草稿不触发嵌入；显式发布才进入后台索引。
- 新版本索引失败时，现有已发布版本继续提供检索。
- 所有保存、发布、回滚操作可追溯，并能阻止并发静默覆盖。

### 暂不包含

- 富文本或 Office 原格式无损编辑。
- OPERATOR / CREATOR 编辑权限；首期仍仅 ADMIN 可管理。
- 多人实时协同编辑和段落级合并。
- 自动发布；任何草稿都必须由管理员显式发布。

## 2. 核心数据设计

### `KnowledgeDocument`

作为稳定的逻辑文档，保留标题、知识库归属、原始文件信息，并新增当前发布版本指针 `publishedVersionId`。

### `KnowledgeDocumentVersion`

每次发布对应一个不可变版本，字段至少包含：

- `documentId + version` 唯一版本号；
- `content`：用于编辑、预览、切块的规范化 Markdown / 纯文本正文；
- `format`：首期为 `markdown` 或 `plain`；
- `status`：`draft / parsing / pending / indexing / published / superseded / failed`；
- `revision`：草稿乐观锁版本；
- `checksum`：正文摘要，用于审计和去重；
- `createdById / updatedById / createdAt / updatedAt / publishedAt`；
- `error / chunkCount`：索引状态和结果。

### `KnowledgeChunk`

切块必须关联 `versionId`。检索只查询 `KnowledgeDocument.publishedVersionId` 指向版本的 chunks；旧版本 chunks 保留以支持回滚。

## 3. 文档生命周期

```text
上传原件
  → 解析正文
  → 创建 v1(pending)
  → 后台索引 v1(indexing)
  → 成功：v1(published) + publishedVersionId=v1
  → 失败：v1(failed)，文档保持无发布版本

编辑已发布文档
  → 从当前发布版本复制 v2(draft)
  → PATCH 保存草稿，仅 revision + 1，不嵌入
  → 管理员点击发布，v2(pending)
  → 后台索引到 v2 独立 chunks
  → 成功后在事务中切换 publishedVersionId=v2，并把 v1 标为 superseded
  → 失败则 v2(failed)，v1 继续在线
```

回滚到历史版本时，不重新嵌入：确认目标版本 chunks 完整后，在事务中切换发布指针并记录审计。

## 4. API 流程

所有管理 API 使用 `route()`、Zod 校验和 `requireRole("ADMIN")`。

| API | 用途 | 关键约束 |
|---|---|---|
| `GET /api/operator/knowledge/documents/:id` | 获取文档、草稿、发布版本和历史 | 不返回服务器文件路径 |
| `PATCH /api/operator/knowledge/documents/:id` | 修改标题或保存草稿 | 必须携带 `baseRevision`；冲突返回 409 |
| `POST /api/operator/knowledge/documents/:id/publish` | 发布当前草稿 | 只把草稿置为 pending，不同步调用 embedding |
| `POST /api/operator/knowledge/documents/:id/restore` | 回滚历史版本 | 目标版本必须有完整 chunks |
| `GET /api/operator/knowledge/documents/:id/original` | 查看/下载原件 | 鉴权后流式返回，设置 `nosniff` 和安全 disposition |
| `POST /api/operator/knowledge/documents/:id/reindex` | 重建当前发布内容 | 创建新版本，不先删线上 chunks |

错误码约定：参数错误 400、未登录 401、无权限 403、不存在 404、版本冲突 409。

## 5. 索引和发布流程

1. Worker 原子认领一个 `pending` 版本，避免重复消费。
2. 读取该版本的 `content`，切块并生成 embedding。
3. chunks 写入该 `versionId`；同版本重试前清理该版本未发布 chunks。
4. 在数据库事务中：
   - 将旧发布版本标记为 `superseded`；
   - 将新版本标记为 `published`；
   - 更新 `KnowledgeDocument.publishedVersionId/status/chunkCount`。
5. 任一步失败：新版本标记 `failed`，不改变当前发布指针。

HNSW 索引必须由 migration 显式创建，避免 Prisma 处理 `Unsupported(vector)` 时意外丢失。

## 6. 管理界面流程

1. 知识库列表点击文档标题进入详情页。
2. 详情页使用“编辑 / 预览 / 版本历史”Tabs：
   - 编辑：标题、Markdown 正文、保存草稿；
   - 预览：安全的 Markdown 渲染和原件入口；
   - 版本历史：版本号、状态、更新时间、发布/回滚操作。
3. “保存草稿”和“发布并更新索引”分离。
4. 发布、回滚、删除使用确认对话框。
5. 发生 409 时停止覆盖，提示刷新后重新合并。

## 7. 权限、安全与审计

- 首期查看管理正文、编辑、发布、回滚均仅 ADMIN。
- OPERATOR / CREATOR 的 Agent 检索仍按知识库可见性，只能命中发布版本。
- Markdown 不启用原始 HTML；原件下载不暴露 `storagePath`。
- 文档内容始终视为不可信 RAG 数据，不能覆盖系统提示和工具权限。
- 正文设置大小上限；保存草稿不自动触发 embedding，避免成本放大。
- 审计动作：`kb.draft.update / kb.publish / kb.restore / kb.reindex`。
- 审计记录版本、revision、checksum 和字段差异，不写整篇正文。
- 版本表是修改历史的权威记录；即使通用 AuditLog 写入失败，也不丢正文版本。

## 8. 数据迁移和兼容

1. 新建版本表并给 chunks 增加 `versionId`。
2. 为既有文档生成 v1：正文暂由既有 chunks 按 ordinal 合并；原件可随后安全重建版本。
3. 既有 published 文档的 v1 设为当前发布版本。
4. chunks 回填 `versionId` 后增加非空约束和外键。
5. 重建 `knowledge_chunk_embedding_hnsw_idx`。
6. 保留旧字段供兼容，后续确认稳定后再清理冗余状态字段。

## 9. 验收清单

- [ ] 上传文档完成后能在线预览规范化正文。
- [ ] 保存草稿不会改变 Agent 当前检索结果。
- [ ] 两个页面同时编辑时，旧 revision 保存收到 409。
- [ ] 新版本索引成功后检索切换到新正文。
- [ ] 新版本索引失败时旧版本仍可检索。
- [ ] 可查看版本历史并回滚到有 chunks 的历史版本。
- [ ] PDF/DOCX/图片原件可安全查看或下载，服务器路径不泄露。
- [ ] OPERATOR/CREATOR 无法调用管理编辑 API。
- [ ] 发布、回滚、重建索引均有审计记录。
- [ ] Prisma validate、typecheck、单元测试通过。

## 10. 实施顺序

1. Prisma schema + migration；
2. 版本仓储和索引器；
3. 文档查看、草稿、发布、回滚、原件 API；
4. 管理端详情页和列表入口；
5. 测试、迁移演练和失败场景验证。
