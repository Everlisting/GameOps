import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { inspiration: db } }));
import { readPublishedInspirations } from "./inspirations";
import { defaultInspirationCover, safeResourceUrl, inspirationCoverFit, INSPIRATION_COLLECTIONS, INSPIRATION_TOPICS } from "./inspiration-catalog";
import { inspirationCreateSchema } from "./validation/inspiration";

describe("公开创作库", () => {
  it("主题与最新版率土创作库的九类名称、顺序一致", () => {
    expect(INSPIRATION_TOPICS.map((topic) => topic.label)).toEqual(["武将立绘", "游戏素材", "三视图库", "百大作者", "率土CG", "率土cos", "故事素材", "武将设定", "联动素材"]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.count.mockResolvedValue(201);
    db.groupBy.mockResolvedValue([{ type: "MATERIAL", category: "IMAGE", _count: { _all: 201 } }]);
    db.findMany.mockResolvedValue([]);
    db.findFirst.mockResolvedValue(null);
  });
  it("对列表、主题标签、统计与分享详情都强制 published=true", async () => {
    await readPublishedInspirations({ item: "draft-id" });
    expect(db.count).toHaveBeenCalledWith({ where: { published: true } });
    expect(db.groupBy.mock.calls[0][0].where).toEqual({ published: true });
    for (const [query] of db.findMany.mock.calls) expect(query.where.published).toBe(true);
    expect(db.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft-id", published: true } }));
  });
  it("主题、类型、标签与关键词可以组合，且第 201 条可分页访问", async () => {
    const result = await readPublishedInspirations({ collection: "image", topic: "武将立绘", tag: "开荒", q: "  赵云  ", page: "9" });
    expect(result.page).toBe(9);
    expect(result.pages).toBe(9);
    expect(db.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 192, take: 24, where: expect.objectContaining({ published: true, type: "MATERIAL", category: "IMAGE", tags: { hasEvery: ["开荒", "武将立绘"] }, OR: expect.any(Array) }) }));
  });
  it("无效分类和页码回退，过大页码收敛到最后一页", async () => {
    const result = await readPublishedInspirations({ collection: "bad", topic: "bad", page: "-1" });
    expect(result.filters.collection).toBe("all");
    expect(result.filters.topic).toBe("");
    expect(result.page).toBe(1);
    expect((await readPublishedInspirations({ page: "999999" })).page).toBe(9);
  });
  it("音频和模板必须具有链接，且有独立资源分类", () => {
    for (const category of ["AUDIO", "TEMPLATE"] as const) {
      const item = { type: "MATERIAL", category, title: "资源", summary: null, content: null, url: null, coverImage: null, tags: [] };
      expect(inspirationCreateSchema.safeParse(item).success).toBe(false);
      expect(inspirationCreateSchema.safeParse({ ...item, url: "https://example.com/resource.zip" }).success).toBe(true);
      expect(INSPIRATION_COLLECTIONS.some((entry) => entry.category === category)).toBe(true);
    }
  });
  it("九类主题参与计数，旧主题标签仍可通过普通标签发现", async () => {
    db.findMany.mockResolvedValueOnce([{ tags: ["故事素材", "AI创作", "文案选题"] }]).mockResolvedValueOnce([]);
    const result = await readPublishedInspirations({ topic: "故事素材" });
    expect(result.filters.topic).toBe("故事素材");
    expect(result.topicCounts["故事素材"]).toBe(1);
    expect(result.allTags).toEqual(expect.arrayContaining(["AI创作", "文案选题"]));
    expect(result.allTags).not.toContain("故事素材");
  });
  it("三视图和宽幅设定保留全图，竖版立绘靠上，常规场景和 CG 居中铺满", () => {
    for (const topic of ["三视图库", "武将设定"]) {
      expect(inspirationCoverFit({ tags: [topic] }, 1.5)).toBe("contain");
    }
    expect(inspirationCoverFit({ tags: ["武将立绘"] }, 0.6)).toBe("top");
    expect(inspirationCoverFit({ tags: [] }, 3)).toBe("contain");
    expect(inspirationCoverFit({ tags: ["联动素材"] }, 1.5)).toBe("cover");
    expect(inspirationCoverFit({ tags: ["率土CG"] }, 16 / 9)).toBe("cover");
  });
  it("拒绝历史危险链接，保留 HTTP(S) 与站内上传资源", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,test", "//evil.test/file", "/uploads/\\evil.test/a"]) expect(safeResourceUrl(value)).toBeNull();
    expect(safeResourceUrl("/uploads/inspirations/image/a.png")).toBe("/uploads/inspirations/image/a.png");
    expect(safeResourceUrl("https://example.com/a.mp4")).toBe("https://example.com/a.mp4");
  });
  it("为提示词和文档按素材 ID 稳定分配对应的默认封面", () => {
    const prompt = { id: "resource-1", type: "MATERIAL", category: "TEXT_PROMPT" } as const;
    const document = { id: "resource-1", type: "DOC_TUTORIAL", category: null } as const;
    expect(defaultInspirationCover(prompt)).toMatch(/\/prompt-.*\.webp$/);
    expect(defaultInspirationCover(prompt)).toBe(defaultInspirationCover({ ...prompt }));
    expect(defaultInspirationCover({ ...prompt, id: "archive-1" })).not.toBe(defaultInspirationCover(prompt));
    expect(defaultInspirationCover(document)).toMatch(/\/document-.*\.webp$/);
    expect(defaultInspirationCover({ ...document, id: "archive-1" })).not.toBe(defaultInspirationCover(document));
    expect(defaultInspirationCover({ ...prompt, category: "TEXT_OTHER" })).toBe(defaultInspirationCover(document));
    expect(defaultInspirationCover({ ...prompt, category: "IMAGE" })).toBeNull();
  });
});
