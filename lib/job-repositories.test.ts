import { describe, expect, it } from "vitest";

import { buildRepositoryPresets } from "@/lib/job-repositories";

describe("buildRepositoryPresets", () => {
  it("merges identical repository settings on the same agent", () => {
    const presets = buildRepositoryPresets([
      {
        id: "job-1",
        name: "主播数据",
        agentId: "agent-1",
        repoType: "GIT",
        repoUrl: " https://example.com/data-hub.git ",
        repoBranch: " main ",
      },
      {
        id: "job-2",
        name: "SLG 数据",
        agentId: "agent-1",
        repoType: "GIT",
        repoUrl: "https://example.com/data-hub.git",
        repoBranch: "main",
      },
    ]);

    expect(presets).toEqual([
      {
        id: "job-1",
        agentId: "agent-1",
        repoType: "GIT",
        repoUrl: "https://example.com/data-hub.git",
        repoBranch: "main",
        jobCount: 2,
        sourceJobNames: ["主播数据", "SLG 数据"],
      },
    ]);
  });

  it("keeps repositories separate across agents and branches", () => {
    const presets = buildRepositoryPresets([
      {
        id: "job-1",
        name: "主分支",
        agentId: "agent-1",
        repoType: "GIT",
        repoUrl: "https://example.com/data-hub.git",
        repoBranch: "main",
      },
      {
        id: "job-2",
        name: "开发分支",
        agentId: "agent-1",
        repoType: "GIT",
        repoUrl: "https://example.com/data-hub.git",
        repoBranch: "develop",
      },
      {
        id: "job-3",
        name: "另一台机器",
        agentId: "agent-2",
        repoType: "GIT",
        repoUrl: "https://example.com/data-hub.git",
        repoBranch: "main",
      },
    ]);

    expect(presets).toHaveLength(3);
  });

  it("ignores empty repository addresses", () => {
    expect(
      buildRepositoryPresets([
        {
          id: "job-1",
          name: "空仓库",
          agentId: "agent-1",
          repoType: "GIT",
          repoUrl: " ",
          repoBranch: "main",
        },
      ]),
    ).toEqual([]);
  });

  it("normalizes an empty branch", () => {
    expect(
      buildRepositoryPresets([
        {
          id: "job-1",
          name: "默认分支",
          agentId: "agent-1",
          repoType: "GIT",
          repoUrl: "https://example.com/data-hub.git",
          repoBranch: null,
        },
      ])[0]?.repoBranch,
    ).toBe("");
  });
});
