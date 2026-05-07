# 高频交互下的 4 个渲染性能决策

当你做一个用户拖滑块、移光标、滚画布的交互式 Web 应用，浏览器需要在每秒 60 次的预算（每帧 16.67ms）里完成"输入处理 → 计算 → 渲染"的全链路。一旦某一步超时，用户就会感觉到"卡"。

这篇文章讨论 4 个在这种场景下反复出现的技术决策，每节回答：**这是什么场景，瓶颈在哪，背后的浏览器/框架机制是什么，怎么选**。

---

## 1. 声明式 vs 命令式：SVG / DOM 何时该换成 Canvas

### 场景

一个实时股票分时图，每秒接收 60 次价格更新，画 1000 个数据点的折线图。

第一版用 SVG：

```jsx
<svg viewBox="0 0 800 400">
  {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" />)}
  <polyline points={pointsToString(points)} />
</svg>
```

数据更新时，React 重新生成 1000 个 `<circle>` 节点。

### 问题

SVG 是 DOM 的一部分。每个 `<circle>` 是一个真实节点，要走完整的浏览器渲染管线：

```
JS (React diff) → Style → Layout → Paint → Composite
```

1000 个节点的 React diff 本身就要几毫秒；浏览器还要计算每个节点的样式、布局位置、绘制层。即使你用 `key` 优化得很好，节点数量本身就是负担。

更糟的是，每个节点都参与 hit testing、accessibility tree、event delegation —— 这些隐性成本在节点数 ≥ 几百时变得明显。

### 技术原理

| | DOM/SVG | Canvas |
|---|---|---|
| 描述方式 | 声明式（节点树） | 命令式（绘制指令） |
| 状态保留 | 浏览器维护 | 你自己维护 |
| Diff 成本 | O(节点数) | 0（每帧重画） |
| 单元素操作 | 可独立修改 | 必须重画整个区域 |
| 命中检测 | 浏览器自动 | 你自己实现 |
| 可访问性 | 内置 | 需要 ARIA fallback |

DOM/SVG 的优势是**单元素可以独立更新**——改一个节点的颜色不需要重画整个场景。Canvas 是反过来：**所有内容每帧重画**，但每帧的成本几乎只取决于像素数，不取决于"逻辑元素"数量。

### 何时切换

把 DOM/SVG 换成 Canvas 的临界点通常是：

- **元素数 ≥ 数百**，且大部分元素每帧都在变
- **更新频率高**（≥ 30Hz 持续）
- **不需要每个元素的独立交互**（点击/hover 这些需要单独处理）

不要为了"听说 Canvas 快"就换。一个 50 个节点的静态表单用 Canvas 是反优化——失去了无障碍、文本可选、自动换行。

### 关键代码差异

```js
// SVG: 1000 个节点，每次更新 React diff
<svg>
  {points.map(p => <circle cx={p.x} cy={p.y} r="2"/>)}
</svg>

// Canvas: 0 个节点，命令式重画
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, w, h);
for (const p of points) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
  ctx.fill();
}
```

---

## 2. Canvas 2D 的"廉价 API"陷阱：fillRect 与 ImageData

### 场景

一个图像滤镜：用户拖阈值滑块，把一张 800×600 的灰度图二值化（每个像素根据亮度判 0/1）。每次滑块变化都要处理 48 万像素。

最直觉的写法：

```js
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const lum = getLuminance(x, y);
    ctx.fillStyle = lum > threshold ? '#fff' : '#000';
    ctx.fillRect(x, y, 1, 1);
  }
}
```

跑一次大概 200ms+，滑块完全不跟手。

### 问题

`fillRect(x, y, 1, 1)` 看起来便宜，但每次调用都要：

1. 验证参数
2. 读取当前 `fillStyle` 字符串、解析颜色（如果是 `'#fff'` 之类）
3. 检查 transform、clip、composite operation 状态
4. 构建一个 1×1 的 path 对象
5. 进入光栅化阶段，做 alpha 合成
6. 将结果写入帧缓冲

48 万次叠加，固定开销吃光时间预算。这不是 GPU 慢——绝大部分时间花在 JS ↔ Skia/Cairo（Chrome 的 2D 引擎）之间的状态同步。

### 技术原理：ImageData 直接写像素缓冲

Canvas 2D 提供了一个**绕过整个绘图状态机**的入口：`ImageData`。它本质上是个 `Uint8ClampedArray`，每个像素 4 字节（RGBA）。你直接写这个数组，最后用 `putImageData` 一次性把内存上传到 canvas 的 backing store。

```js
const id = ctx.getImageData(0, 0, w, h);  // 或 createImageData
const d = id.data;  // Uint8ClampedArray，长度 = w * h * 4

for (let i = 0; i < d.length; i += 4) {
  const lum = (d[i] + d[i+1] + d[i+2]) / 3;
  const v = lum > threshold ? 255 : 0;
  d[i] = v; d[i+1] = v; d[i+2] = v;
  // d[i+3] 是 alpha，不动
}

ctx.putImageData(id, 0, 0);
```

实测对比（48 万像素、Chrome 2026）：

| 方法 | 耗时 |
|---|---:|
| 48 万次 `fillRect(x, y, 1, 1)` | ~210ms |
| ImageData 直写 + `putImageData` | ~6ms |

**~35× 提速。**

为什么差距这么大？ImageData 路径里：
- 没有 fillStyle 解析（直接写字节）
- 没有 path 构建
- 没有 transform/clip 检查
- `putImageData` 是一次性 GPU 上传，不是 48 万次小操作

### 何时适用

- **逐像素处理**（滤镜、热力图、噪声生成、图像处理）
- **像素互不重叠**（重叠时 ImageData 是覆盖语义，`fillRect+globalAlpha` 是混合语义，结果不同）
- **像素数超过几千**（数百以下两者无显著差异）

### 何时不适用

- **大色块/几何图形**（这种 `fillRect(0, 0, 800, 600)` 一次调用就够了，反而比循环写 ImageData 快）
- **需要抗锯齿**（ImageData 是离散像素，没法做亚像素抗锯齿）
- **需要混合模式**（`globalCompositeOperation` 在 ImageData 路径里失效）

### 类似的"廉价 API 陷阱"

Canvas 2D 还有几个被低估的开销点：

- `ctx.save()` / `ctx.restore()`：每次保存完整 2D state stack
- 动态修改 `ctx.fillStyle`（尤其是字符串颜色）：每次都要重新 parse
- `ctx.beginPath()` 后只画一次：频繁创建/销毁 path 对象

热路径里这些都值得用 `performance.now()` 量一下。

---

## 3. React 依赖契约：分离"重新计算"与"重新渲染"

### 场景

一个数据表格，有：原始数据数组、排序字段、过滤条件、关键词高亮颜色。

第一版：

```tsx
const visibleRows = useMemo(() => {
  const sorted = [...data].sort(by(sortField));
  const filtered = sorted.filter(matchesQuery);
  return filtered;
}, [data, sortField, query, highlightColor]);  // ⚠️ highlightColor
```

用户改高亮颜色 → 整个数组重新排序 + 过滤一遍。如果 `data` 是 10 万行，改个颜色卡半秒。

### 问题

这是 React 里最常见的性能 bug：**把"用到的"变量都塞进依赖列表，不区分"会改变结果的"和"只是渲染时引用的"**。

ESLint 的 `react-hooks/exhaustive-deps` 规则会逼你把"用到的"都列上，但它没法判断哪些"用到的"真的影响计算输出。这层判断只能你做。

`highlightColor` 在 `visibleRows` 的计算里**完全没出现**。它影响的是渲染（每行用什么颜色画高亮），不影响"哪些行可见"。

### 技术原理：useMemo 的契约

`useMemo(fn, deps)` 的契约是："当 `deps` 没变时，可以安全地复用上次的返回值"。换句话说：**`fn` 的输出必须只由 `deps` 决定**。

如果 `deps` 包含了不影响输出的变量：
- 不影响正确性（只是多算）
- **会破坏性能**（每次那个变量变都重算）

如果 `deps` 漏掉了影响输出的变量：
- **破坏正确性**（用了过期的缓存）

ESLint 规则只防后一种，不防前一种。

### 解决方案：依赖分层

把每一步独立成自己的 useMemo，依赖只列真正影响那一步的变量：

```tsx
// 排序：只依赖数据 + 排序字段
const sorted = useMemo(
  () => [...data].sort(by(sortField)),
  [data, sortField],
);

// 过滤：只依赖排序结果 + 查询
const filtered = useMemo(
  () => sorted.filter(matchesQuery(query)),
  [sorted, query],
);

// 渲染时引用 highlightColor，不再放进 deps
return filtered.map(row => (
  <Row key={row.id} row={row} highlightColor={highlightColor} query={query} />
));
```

现在改 `highlightColor`：
- `sorted` 不重算（依赖未变）
- `filtered` 不重算（依赖未变）
- 只有 `<Row>` 组件重新渲染

10 万行表格改颜色从 500ms 降到 1ms。

### 推论：useEffect 同理

`useEffect` 也遵循同样的契约。如果一个 effect 依赖了 `[A, B, C]` 但内部只用 A 决定要不要执行操作，B/C 的变化会触发不必要的副作用执行（重新订阅、重新请求、重新画 canvas）。

把 useEffect 拆成多个，每个只跟随真正驱动它的状态。

---

## 4. Web Worker 的隐藏代价：什么场景该用

### 场景 A：代码编辑器的语法高亮

用户在编辑器里输入代码。每次按键，需要重新 tokenize 整个文件、构建语法树、推断高亮范围。对一个 5000 行的文件，这可能要 50-100ms。

如果在主线程做：每按一个键，光标卡住 100ms，输入手感断裂。

**这种场景适合 Worker**：

```js
// main thread
input.addEventListener('input', () => {
  worker.postMessage({ code: input.value });
});

worker.onmessage = (e) => {
  applyHighlight(e.data.tokens);
};

// worker
self.onmessage = (e) => {
  const tokens = tokenize(e.data.code);
  postMessage({ tokens });
};
```

代价：高亮永远比输入晚一两帧（用户已经打了下一个字符，颜色才更新到上一个字符）。但**这种延迟不破坏体验**——用户的注意力在打字本身，颜色滞后 30ms 看不出来。

### 场景 B：颜色选择器

用户在色盘上拖动光标选颜色，旁边的预览区实时显示当前颜色。

如果用 Worker：用户拖到红色，30ms 后预览才变红。看起来像"色盘和预览失联了"。用户会无意识地拖更快、来回拖，因为反馈不及时。

**这种场景不适合 Worker**：颜色计算本身很便宜（RGB ↔ HSL 是几个浮点运算），同步算在 sub-ms 级别。引入 Worker 反而是性能倒退。

### 技术原理：Worker 的成本模型

Worker 不是免费的"额外线程"。它的代价分三层：

#### 1. 启动成本

`new Worker(...)` 要解析 worker 脚本、建立独立 V8 上下文、初始化模块系统。Vite 用 ESM worker 时第一次启动通常 20-50ms。**结论**：worker 应该是长生命周期的，不要频繁创建销毁。

#### 2. 通信成本：Structured Clone

`postMessage(data)` 默认走 [Structured Clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)。它会**深拷贝**数据：

| 数据 | structured clone 耗时 |
|---|---:|
| `{x: 1, y: 2}` × 1000 | ~0.5ms |
| `{x: 1, y: 2}` × 100,000 | ~25ms |
| `Uint16Array(200000)` | ~25ms（默认拷贝）/ 0ms（Transferable） |

如果数据量大，可以用 [Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) 做零拷贝转移：

```js
const buf = new Uint16Array(100000);
worker.postMessage(buf, [buf.buffer]);  // 第二个参数是 transfer list
// 此后主线程的 buf 变成 detached（length=0），所有权交给 worker
```

但要把数据塞进 typed array，对结构化数据（对象数组）需要序列化逻辑，写代码更复杂。

#### 3. 异步性的体验代价

这是最容易被忽视的一项。Worker 把同步操作变成了异步：

```
主线程同步：
  input → compute (50ms blocks) → render → next frame

Worker 异步：
  input → render (immediate) → ... 50ms ... → message back → render (real)
```

数字漂亮了（主线程没被阻塞），但用户看到的不是同一件事——他看到的是**两次更新**，中间隔了 50ms。

如果两次更新视觉上相似（颜色微调），用户感觉是"流畅"。如果两次更新结构不同（图案完全变了），用户感觉是"先看到一个错的预览，又被纠正"——比同步卡顿更糟。

### 决策标准

回答这两个问题：

1. **用户的注意力在哪？**
   - 在自己的输入上（打字、拖动）→ 晚一帧反馈通常 OK
   - 在结果上（探索参数空间、预览效果）→ 必须实时

2. **延迟期间的"占位内容"会不会撒谎？**
   - 占位内容和最终结果视觉相似（变色、抗锯齿）→ 用 worker + 占位 OK
   - 占位内容和最终结果结构不同（图案、布局）→ 用 worker 会破坏直接操控感

如果两个答案都倾向"必须同步"，就接受同步阻塞。先用第 1-3 节的方法把同步代价压到最小，剩下的算法时间是必要成本，不是 bug。

---

## 决策清单

每次遇到"前端某个东西卡了"，按这个顺序排查：

1. **是 DOM 节点数太多吗？** → 考虑 Canvas（第 1 节）
2. **是 Canvas API 调用次数太多吗？** → 考虑 ImageData / 减少 state 变更（第 2 节）
3. **是 React 在重算不该重算的东西吗？** → 检查 useMemo/useEffect 依赖（第 3 节）
4. **是单步同步计算确实太重吗？** → 考虑 Worker，但先想清楚交互模型（第 4 节）

前三步几乎都是"纯赢"——做了没坏处。第四步必须考虑产品取舍：你是在让交互更流畅，还是在让数字更好看？这两件事不一样。

性能优化的尽头不是"最快的代码"，是"在这个场景里最该有的体验"。
