---
title: 在你的 Agent 中使用 Viral Video Cloner
description: 选择与 Agent 协作的入口，安装 Viral Video Cloner，并让视频项目持续可用。
---

Viral Video Cloner 为 Agent 提供视频制作知识与执行工具。你与 Agent 沟通，它读写项目、制作素材并运行编排。
选择哪个 Agent，与选择哪些模型和部署服务来制作素材，是两件事。

## 从你的工作环境开始

Claude Code 和 Codex 是常用入口。在 Agent 中打开视频项目，通过它支持的 Skill 安装方式安装 Viral Video Cloner。
使用 skills CLI 时，命令为：

```bash
npx skills add <this-repository> -g
```

随后 Agent 可以找到或安装 `@hypit/hypit` 可执行程序。把参考视频或创作要求交给它，说明想要的结果。
[快速开始](../quickstart.md) 介绍实际制作过程。这里列出的是使用方式；合作关系在下方单独标明。

终端、桌面应用或浏览器都可以是入口。真正影响制作的是背后的工作环境：能否访问项目文件、
执行 Viral Video Cloner 与所选工具，以及把作品展示给你。使用远程 Agent 时，将素材交给它实际运行的环境，
通过该环境的预览转发或文件交付查看作品。远程机器的 localhost 地址，并不是你电脑上的预览地址。

项目和生成素材应当在会话或临时环境结束后仍然可用。Agent 可以说明文件保存位置，打开 Studio
供你查看时间线、调整属性，也可以打开 Comments，按具体时刻留下意见。审阅编排与导出视频是不同的操作。

## 接入其他 Agent 环境

集成方可以提供 Skill 的读取与安装、项目文件和命令执行能力，以及预览和成片的访问方式。
它沿用 Viral Video Cloner 已有接口，不需要为每个 Agent 创造另一套视频语法或 Provider。
从环境实际开放的能力出发，把作品保存在哪里、能保存多久、怎样查看交代清楚。

素材生成的接入见[模型与 Provider](./providers.md)和模型与部署服务合作方。
