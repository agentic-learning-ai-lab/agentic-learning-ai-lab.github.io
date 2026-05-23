---
carousel: true
affiliations:
  - { name: 'Amelia (Hui) Dai', aff: 'New York University' }
  - { name: 'Ryan Teehan',      aff: 'New York University' }
  - { name: 'Mengye Ren',       aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/daily-oracle
  huggingface: https://huggingface.co/datasets/agentic-learning-ai-lab/daily-oracle
  poster: /assets/projects/daily-oracle/icml2025-poster-daily-oracle.pdf
bibtex: |
  @inproceedings{dai2025dailyoracle,
    title     = {Are LLMs Prescient? A Continuous Evaluation using Daily News as the Oracle},
    author    = {Dai, Hui and Teehan, Ryan and Ren, Mengye},
    booktitle = {International Conference on Machine Learning (ICML)},
    year      = {2025}
  }
---

<script src="https://d3js.org/d3.v7.min.js"></script>
<!-- Plotly 1.58.5 (last v1 release) is pinned to match the legacy
     daily-oracle widget's look: per-curve individual tooltips at
     hovered x, top-anchored modebar layout, and the denser default
     legend item spacing. v2's modebar styling and legend metrics
     differ enough that swapping versions visibly changes the page. -->
<script src="https://cdn.plot.ly/plotly-1.58.5.min.js"></script>

## Model Performance Over Time (Closed-Book) {data-toc="Live Trends"}

<div class="do-widget">
  <div class="field is-grouped is-flex-wrap-wrap">
    <div class="control">
      <label class="label">From:</label>
      <input class="input" type="month" id="startMonth">
    </div>
    <div class="control">
      <label class="label">To:</label>
      <input class="input" type="month" id="endMonth">
    </div>
  </div>
  <div class="field">
    <label class="checkbox">
      <input type="checkbox" id="showRaw">
      Show raw trend
    </label>
  </div>
  <div class="field">
    <label class="label">Models:</label>
    <div id="seriesToggles" class="control"></div>
  </div>
  <div class="columns">
    <div class="column">
      <h4 class="subtitle">TF Questions</h4>
      <div id="trendPlotTF" style="height:520px;"></div>
    </div>
    <div class="column">
      <h4 class="subtitle">MC Questions</h4>
      <div id="trendPlotMC" style="height:520px;"></div>
    </div>
  </div>
</div>

## Browse Daily QA Pairs {data-toc="QA Browser"}

<div class="do-widget">
  <div class="box">
    <div class="columns">
      <div class="column is-half">
        <div class="field">
          <label class="label">Select date:</label>
          <div class="control">
            <input class="input" type="date" id="qaDatePicker">
          </div>
        </div>
        <div class="field">
          <label class="label">Category:</label>
          <div class="control">
            <div class="select is-fullwidth">
              <select id="qaCategoryFilter">
                <option value="All">All</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
    <h4 class="subtitle">True/False Questions</h4>
    <div class="table-container scrollable-table">
      <table class="table is-striped is-fullwidth" id="qaTableTF">
        <thead>
          <tr><th>Question</th><th>Answer</th><th>Source Article</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <h4 class="subtitle" style="margin-top:2em;">Multiple-Choice Questions</h4>
    <div class="table-container scrollable-table">
      <table class="table is-striped is-fullwidth" id="qaTableMC">
        <thead>
          <tr><th>Question</th><th>a</th><th>b</th><th>c</th><th>d</th><th>Answer</th><th>Source Article</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>

## Daily Oracle Dataset {data-toc=Dataset}

### Dataset Overview

- **Daily Oracle** is a continuous evaluation benchmark using automatically generated QA pairs from daily news to assess how the future prediction capabilities of LLMs evolve over time.
- While Daily Oracle is daily updated, for our current analysis we use the subset covering the period from January 2020 to December 2024 (~17.2 questions per day).

<div class="do-dataset-row">
  <div><img src="/assets/projects/daily-oracle/question_size.png" alt="Question size"></div>
  <div><img src="/assets/projects/daily-oracle/pie_category.png" alt="Category breakdown"></div>
</div>

### Example QA pairs

![](example.png){width=800}

### QA Construction Pipeline

For each day, we collect news articles from the daily-updated Common Crawl News Dataset and scrape news using the Newspaper3k package. We use LLMs to generate QA pairs with the few-shot prompting technique.

![](qa-gen-plot-v2.png)

## Evaluation {data-toc=Evaluation}

### Closed-Book Setting

- In the closed-book setting, we assess how accurately LLMs can answer forecasting questions based on the knowledge they learned from their training data without providing extra information.
- Performance degradation over time is observed across all models. This indicates that while LLMs demonstrate certain abilities to understand real-world events and make predictions, they struggle to maintain these abilities.

![](main_plot.png){width=900}

### Constrained Open-Book Setting

- In the constrained open-book setting, we explore how access to news articles up to different time cutoffs influences LLM performance using RAG.
- *RAG cutoff*: the latest accessible date for retrieving articles.
- RAG has the potential to enhance prediction accuracy, but the performance degradation pattern persists, highlighting the need for continuous model updates.

<div class="project-carousel do-carousel">
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_mixtral-8x7b_plot.png" alt="Mixtral-8x7B">
    <p class="caption">Mixtral-8x7B in the constrained open-book setting.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_mistral-7b_plot.png" alt="Mistral-7B">
    <p class="caption">Mistral-7B in the constrained open-book setting.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_llama3_plot.png" alt="Llama-3-8B">
    <p class="caption">Llama-3-8B in the constrained open-book setting.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_qwen2-7b_plot.png" alt="Qwen-2-7B">
    <p class="caption">Qwen-2-7B in the constrained open-book setting.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_gemma2-2b_plot.png" alt="Gemma-2-2B">
    <p class="caption">Gemma-2-2B in the constrained open-book setting.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_claude-3-5-sonnet_plot.png" alt="Claude-3.5-Sonnet">
    <p class="caption">Claude-3.5-Sonnet in the constrained open-book setting.</p>
  </div>
  <div class="item">
    <img src="/assets/projects/daily-oracle/rag_gpt-4_plot.png" alt="GPT-4">
    <p class="caption">GPT-4 in the constrained open-book setting.</p>
  </div>
</div>

### Gold Article Setting

- In the gold article setting, models are provided direct access to the gold article from which the question is generated.
- LLM performance can be improved significantly to around 90%, demonstrating the answerability of Daily Oracle.
- However, even when these are treated as reading comprehension questions rather than forecasting questions, most of the models still show declining trends.
- This provides an "upper bound" of open-book retrieval, and the remaining decline in the model's performance suggests continuous pre-training of LLMs is still needed in the context of news event forecasting to address outdated representations.

![](gold_plot.png){width=900}

<script>
  // Daily Oracle interactive analysis. Ported from the legacy
  // per-project page; CSV paths rewritten to the new asset location.
  // hovermode: 'x' gives one tooltip per curve at the hovered x
  // (matches legacy). d3 + Plotly load inline above; Plotly is
  // pinned to v1 so tooltips, modebar position, and legend density
  // match the legacy widget. Widget chrome (inputs, tables, columns)
  // is styled by the per-project style.css — no Bulma dependency.
  const dailyOracleModels = [
    { name: 'Claude-3.5-Sonnet', id: 'claude-3-5-sonnet', color: 'green',   knowledge_cutoff: '2024-04' },
    { name: 'GPT-4',             id: 'gpt-4',             color: 'olive',   knowledge_cutoff: '2023-04' },
    { name: 'GPT-3.5',           id: 'gpt-35',            color: 'blue',    knowledge_cutoff: '2021-09' },
    { name: 'Mixtral-8x7B',      id: 'mixtral-8x7b',      color: 'cyan',    knowledge_cutoff: null       },
    { name: 'Mistral-7B',        id: 'mistral-7b',        color: 'purple',  knowledge_cutoff: null       },
    { name: 'Llama-3-8B',        id: 'llama3',            color: 'red',     knowledge_cutoff: '2023-03' },
    { name: 'Qwen-2-7B',         id: 'qwen2-7b',          color: 'orange',  knowledge_cutoff: null       },
    { name: 'Gemma-2-2B',        id: 'gemma2-2b',         color: 'black',   knowledge_cutoff: '2024-07' }
  ];
  const _doColorMap = {}, _doNameMap = {};
  dailyOracleModels.forEach(m => { _doColorMap[m.id] = m.color; _doNameMap[m.id] = m.name; });

  Promise.all([
    d3.csv('/assets/projects/daily-oracle/data/evaluation/closed_book_tf_2020-01-01_2025-06-30.csv'),
    d3.csv('/assets/projects/daily-oracle/data/evaluation/closed_book_mc_2020-01-01_2025-06-30.csv'),
    d3.csv('/assets/projects/daily-oracle/data/questions/tf_questions_2020-01-01_2025-06-30_lite.csv'),
    d3.csv('/assets/projects/daily-oracle/data/questions/mc_questions_2020-01-01_2025-06-30_lite.csv')
  ]).then(([rawTFacc, rawMCacc, rawTFqa, rawMCqa]) => {
    function parseAcc(raw) {
      return raw.map(r => {
        const obj = { date: new Date(r.date) };
        Object.keys(r).filter(k => k.startsWith('all_acc_')).forEach(k => obj[k] = +r[k]);
        return obj;
      }).sort((a,b) => a.date - b.date);
    }
    const dataTF = parseAcc(rawTFacc), dataMC = parseAcc(rawMCacc);
    const rawKeys  = Object.keys(dataTF[0]).filter(k => k.startsWith('all_acc_') && !k.includes('_ma_'));
    const maKeys   = rawKeys.map(k => k.replace('all_acc_', 'all_acc_ma_'));
    const modelIds = rawKeys.map(k => k.replace('all_acc_', ''));
    const allDates = dataTF.map(d=>d.date).concat(dataMC.map(d=>d.date));
    const minMM = new Date(Math.min(...allDates)).toISOString().slice(0,7);
    const maxMM = new Date(Math.max(...allDates)).toISOString().slice(0,7);
    const startM = document.getElementById('startMonth'), endM = document.getElementById('endMonth');
    [startM,endM].forEach(i => { i.min = minMM; i.max = maxMM; });
    startM.value = minMM; endM.value = maxMM;
    const toggles = document.getElementById('seriesToggles');
    modelIds.forEach(id => {
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'cb_' + id; cb.checked = true;
      cb.addEventListener('change', drawPlots);
      const lbl = document.createElement('label');
      lbl.htmlFor = cb.id; lbl.className = 'checkbox'; lbl.style.marginRight = '1em';
      lbl.appendChild(cb); lbl.append(' ' + _doNameMap[id]);
      toggles.appendChild(lbl);
    });
    document.getElementById('showRaw').addEventListener('change', drawPlots);
    [startM,endM].forEach(i => i.addEventListener('change', drawPlots));
    function drawPlots() {
      const [y1,m1] = startM.value.split('-').map(Number);
      const [y2,m2] = endM.value.split('-').map(Number);
      const from = new Date(y1,m1-1,1), to = new Date(y2,m2,0);
      const showRaw = document.getElementById('showRaw').checked;
      function buildTraces(data) {
        return modelIds.flatMap((id,i) => {
          if (!document.getElementById('cb_' + id).checked) return [];
          const wd = data.filter(d => d.date >= from && d.date <= to);
          const arr = [{ x: wd.map(d => d.date), y: wd.map(d => d[maKeys[i]]), mode: 'lines',
                         name: _doNameMap[id] + ' (MA)', line: { color: _doColorMap[id], dash: 'solid' } }];
          if (showRaw) arr.push({ x: wd.map(d => d.date), y: wd.map(d => d[rawKeys[i]]), mode: 'lines',
                                  name: _doNameMap[id] + ' (raw)', line: { color: _doColorMap[id], dash: 'dash' } });
          return arr;
        });
      }
      const shapes = dailyOracleModels.filter(m => m.knowledge_cutoff && document.getElementById('cb_' + m.id).checked).map(m => {
        const cd = new Date(m.knowledge_cutoff + '-01');
        return { type: 'line', xref: 'x', x0: cd, x1: cd, yref: 'paper', y0: 0, y1: 1,
                 line: { color: m.color, width: 2, dash: 'dot' } };
      });
      const cutoffTrace = { x: [from, to], y: [0, 0], mode: 'lines', name: 'Knowledge cutoff',
                            line: { color: 'gray', dash: 'dot' }, showlegend: true, hoverinfo: 'none', visible: 'legendonly' };
      // Smaller legend font + the narrow .column flex track let the
      // 9 model items wrap to 2 rows in practice. (Plotly v1 has no
      // legend.width attribute; wrap is column-width-driven.)
      // Modebar layout — Plotly v1 has no `modebar.orientation` attr;
      // CSS in style.css forces the modebar to a single row above the
      // plot. margin.t kept at 20 since the modebar lives in negative-
      // top space outside the plot area.
      // Read theme tokens from the host page's CSS vars so the chart
      // honors light/dark mode. Re-evaluated on each newPlot call so a
      // theme change between renders picks up the new palette.
      const themed = () => {
        const cs = getComputedStyle(document.documentElement);
        return {
          fg: cs.getPropertyValue('--fg').trim() || '#2c2c2c',
          bg: cs.getPropertyValue('--bg').trim() || '#ffffff',
          grid: cs.getPropertyValue('--border').trim() || '#e5e7eb',
        };
      };
      const trendLayout = (yTitle) => {
        const t = themed();
        return {
          margin: { t: 20, b: 40, l: 50, r: 20 },
          paper_bgcolor: t.bg,
          plot_bgcolor: t.bg,
          font: { color: t.fg },
          xaxis: { title: 'Date', gridcolor: t.grid, linecolor: t.grid, zerolinecolor: t.grid },
          yaxis: { title: yTitle, gridcolor: t.grid, linecolor: t.grid, zerolinecolor: t.grid },
          legend: { orientation: 'h', x: 0, y: -0.2, font: { size: 11, color: t.fg } },
          hovermode: 'x', shapes
        };
      };
      const trendConfig = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: [
          'lasso2d', 'select2d', 'autoScale2d',
          'hoverClosestCartesian', 'hoverCompareCartesian',
          'toggleSpikelines'
        ]
      };
      Plotly.newPlot('trendPlotTF', [cutoffTrace].concat(buildTraces(dataTF)),
        trendLayout('TF Accuracy'), trendConfig);
      Plotly.newPlot('trendPlotMC', [cutoffTrace].concat(buildTraces(dataMC)),
        trendLayout('MC Accuracy'), trendConfig);
    }
    const tfData = rawTFqa.map(r => ({ date: r.date, question: r.question, answer: r.answer, title: r.title, url: r.url, category: r.category }));
    const mcData = rawMCqa.map(r => ({ date: r.date, question: r.question, a: r.choice_a, b: r.choice_b, c: r.choice_c, d: r.choice_d, answer: r.answer, title: r.title, url: r.url, category: r.category }));
    const categories = Array.from(new Set(tfData.map(r => r.category).concat(mcData.map(r => r.category)))).sort();
    const catFilter = document.getElementById('qaCategoryFilter');
    categories.forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.text = cat; catFilter.appendChild(opt); });
    const qaPicker = document.getElementById('qaDatePicker');
    const allQADates = Array.from(new Set(tfData.map(r => r.date).concat(mcData.map(r => r.date)))).sort();
    qaPicker.min = allQADates[0]; qaPicker.max = allQADates[allQADates.length - 1]; qaPicker.value = allQADates[allQADates.length - 1];
    qaPicker.addEventListener('change', () => renderQA(qaPicker.value));
    catFilter.addEventListener('change', () => renderQA(qaPicker.value));
    function renderQA(date) {
      const selectedCat = catFilter.value;
      const tfRows = tfData.filter(r => r.date === date && (selectedCat === 'All' || r.category === selectedCat));
      const tfBody = document.querySelector('#qaTableTF tbody'); tfBody.innerHTML = '';
      if (!tfRows.length) tfBody.innerHTML = `<tr><td colspan="3" class="has-text-centered">No TF questions for ${date}</td></tr>`;
      else tfRows.forEach(r => { const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.question}</td><td>${r.answer}</td><td><a href="${r.url}" target="_blank">${r.title}</a></td>`; tfBody.appendChild(tr); });
      const mcRows = mcData.filter(r => r.date === date && (selectedCat === 'All' || r.category === selectedCat));
      const mcBody = document.querySelector('#qaTableMC tbody'); mcBody.innerHTML = '';
      if (!mcRows.length) mcBody.innerHTML = `<tr><td colspan="7" class="has-text-centered">No MC questions for ${date}</td></tr>`;
      else mcRows.forEach(r => { const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.question}</td><td>${r.a}</td><td>${r.b}</td><td>${r.c}</td><td>${r.d}</td><td>${r.answer}</td><td><a href="${r.url}" target="_blank">${r.title}</a></td>`; mcBody.appendChild(tr); });
    }
    drawPlots(); renderQA(qaPicker.value);
  }).catch(err => { console.error('[daily-oracle] CSV load error:', err); });
</script>
