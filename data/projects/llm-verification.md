---
mathjax: true
affiliations:
  - { name: 'Jack Lu',     aff: 'New York University', url: 'https://jacklu-me.com',                                       equal: true }
  - { name: 'Ryan Teehan', aff: 'New York University', url: 'https://rteehas.github.io/',                                  equal: true }
  - { name: 'Jinran Jin',  aff: 'New York University', url: 'https://www.linkedin.com/in/jinran-jin-093252319/' }
  - { name: 'Mengye Ren',  aff: 'New York University' }
links:
  code: https://github.com/agentic-learning-ai-lab/llm-verification
bibtex: |
  @misc{lu2025llmverification,
    title         = {When Does Verification Pay Off? A Closer Look at LLMs as Solution Verifiers},
    author        = {Jack Lu and Ryan Teehan and Jinran Jin and Mengye Ren},
    year          = {2025},
    eprint        = {2512.02304},
    archivePrefix = {arXiv},
    primaryClass  = {cs.CL}
  }
---

<style>
.project-prose ul {
  list-style: disc;
  margin: 0 0 1rem;
  padding-left: 1.5rem;
}
.project-prose li + li { margin-top: 0.25rem; }
.project-prose a {
  color: #3b82f6;
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
.project-prose a:hover { color: #60a5fa; }
</style>

<p style="max-width: 56rem; margin: 0 auto 3rem; padding: 0 1.5rem;"><strong>News!</strong> <a href="https://loganbolton.github.io/blog/vlm-verification/">Logan Bolton's independent study</a> extends these findings to vision-language models as judges.</p>

## Overview of Our Study {data-toc=Overview}

We describe our experimental setup, the metrics we use to measure verification ability, and the verification settings we study.

### Models

We treat every model as both a **solver** and a **verifier**. As a solver, each model generates a chain-of-thought solution per problem; as a verifier, it reads the original problem and a solution to decide whether the solution is correct (also with chain-of-thought). We evaluate 37 models, including 21 post-trained and 16 base models from the <span class="model-llama3">Llama3</span>, <span class="model-qwen25">Qwen2.5</span>, <span class="model-qwen3">Qwen3</span>, and <span class="model-deepseek">DeepSeek-R1</span> families spanning 0.5B–72B parameters.

### Datasets

We evaluate nine tasks spanning mathematical reasoning ([**GSM8K**](https://huggingface.co/datasets/openai/gsm8k), [**AIME**](https://huggingface.co/datasets/TianHongZXY/aime-1983-2025)), commonsense and factual knowledge ([**CSQA**](https://huggingface.co/datasets/tau/commonsense_qa), [**GPQA**](https://huggingface.co/datasets/Idavidrein/gpqa), [**MMLU STEM**](https://huggingface.co/datasets/cais/mmlu), [**MMLU Social Sciences**](https://huggingface.co/datasets/cais/mmlu)), and synthetic tasks involving logical reasoning (**3SAT**), structured puzzle solving (**Sudoku**), and symbolic computation (**Matrix Multiplication**). These tasks provide ground-truth labels for measuring verifier quality across skills relevant to real deployment settings.

### Metrics

Verifier accuracy can obscure whether errors are false positives or false negatives. In the limit of repeated rejection sampling, the accuracy of accepted solutions converges to verifier precision. We therefore define **verifier gain** as verifier precision minus the solver's original accuracy:

$$
\underbrace{Gain(S, V; D)}_{\substack{\text{asymptotic performance} \\ \text{improvement from using verifier}}}
\;=\;
\underbrace{Precision(S, V; D)}_{\substack{\text{asymptotic accuracy after} \\ \text{rejection sampling with verifier}}}
\;-\;
\underbrace{SolverAccuracy(S; D)}_{\text{base solver's accuracy}}
$$

where $V$ is a verifier, $S$ is a solver, and $D$ is a dataset.

### Verification Settings

We compare three ways of pairing solvers and verifiers:

- **Self-Verification:** the same model acts as both solver and verifier.
- **Intra-Family Verification:** solver and verifier come from the same model family but have different sizes.
- **Cross-Family Verification:** solver and verifier are drawn from different model families or differ in base vs. post-trained.

## Does Verifier Gain Predict Improvements from Resampling? {data-toc="Verifier Gain"}

Our verifier gain metric estimates the expected improvement in a solver's accuracy when using a verifier for rejection sampling. To assess how well this metric predicts real performance, we conduct rejection sampling experiments across all solver–verifier pairs from a 12-model subset of our post-trained models. For each problem in each dataset, the solver generates solutions until the verifier labels one as correct, for up to 10 attempts; if no such solution is found, we retain the final attempt.

> **Takeaway**
>
> Verifier gain reliably predicts rejection sampling gains and serves as a powerful comparative metric for evaluating solver–verifier pairs. Crucially, it can be estimated from a single round of verifier evaluations without costly rejection sampling experiments.

![](results_empirical_gap_scatterplot-1.png){width=800}

## Do Better Solvers Make Better Verifiers? {data-toc="Solver–Verifier Relationship"}

We test whether a model's solver accuracy predicts its performance as a verifier. For each of 21 post-trained models, we average verifier accuracy, false positive rate (FPR), false negative rate (FNR), and gain over solvers and datasets within each verification setting. The relationship depends on the setting!

> **Takeaway**
>
> - Under self- and intra-family verification, verifiers are more likely to accept incorrect solutions.
> - Verification accuracy does not reliably predict test-time improvement. Verifier gain, which combines solver accuracy and verifier precision, is more informative.
> - <span class="model-llama3">Llama3</span> and <span class="model-qwen25">Qwen2.5</span> show some self-improvement. <span class="model-deepseek">DeepSeek</span> and <span class="model-qwen3">Qwen3</span> show negligible gains and spontaneously self-verify far more often during solving (73–96% vs. 1–2%).

![](results_cross_dataset_verifier_scatterplots_solver_acc-1.png){width=800}

## Are Verifiers Biased Toward Solutions That Resemble Their Own? {data-toc="Similarity Bias"}

Reasoning models have higher FPR under self- and intra-family verification than under cross-family verification, suggesting a bias toward incorrect solutions that resemble their own. We test this hypothesis across 12 post-trained models. For each **solver–verifier pair**, we compare verifier metrics with the average cosine similarity between the models' solution embeddings.

> **Takeaway**
>
> Higher similarity between solver and verifier solution distributions is associated with a greater tendency to accept incorrect solver outputs and with lower verifier gain. Choosing a verifier with a meaningfully different solution distribution can mitigate this bias.

![](results_verifier_similarity_scatterplot-1.png){width=800}

## How Does Reasoning Post-Training Affect Solver and Verifier Performance? {data-toc="Post-Training Effects"}

Our analysis focuses on the <span class="model-qwen25">Qwen2.5-Base</span>/<span class="model-qwen25">Qwen2.5</span> and <span class="model-qwen3">Qwen3-Base</span>/<span class="model-qwen3">Qwen3</span> model pairs. For each model, we compute verifier metrics against all solvers and datasets, partition results by verification setting, and average within families.

> **Takeaway**
>
> Reasoning post-training significantly improves problem-solving but can reduce self- and intra-family verification gains, while boosting cross-family verification performance.

![](results_posttraining_verifier_barplots_remove_llama-1.png){width=800}

## How Does Task Type Affect Verifiability? {data-toc="Task Verifiability"}

We next ask two task-level questions:

- *Are tasks that are easy to solve also easy to verify?*
- *Are some tasks inherently easier to verify than others?*

Across 21 post-trained models, we average verifier accuracy and gain over solver–verifier pairs for each task and compare them with solver accuracy.

> **Takeaway**
>
> - Tasks that are easy to solve tend to be easy to verify.
> - Easier tasks yield larger gains under intra-family and cross-family verification, but not necessarily under self-verification.
> - Across our evaluated models and tasks, logical and mathematical problems are easier to verify and yield larger verifier gains than factual-recall tasks.

![](results_cross_dataset_task_scatterplots-1.png){width=900}

## A Checklist for Designing Effective Solver–Verifier Systems {data-toc="Design Checklist"}

> - **Use verifier gain, not accuracy, to evaluate a solver–verifier pair.** Verification accuracy can be misleading, while verifier gain strongly predicts actual rejection sampling gains.
> - **Check whether the task is easier to verify than to solve.** Our experiments find higher gains on logical and mathematical reasoning tasks than on knowledge-recall tasks.
> - **Prefer verifiers that "think differently" from the solver.** Greater solution-distribution similarity is associated with more false positives and lower gains.
> - **Avoid using strong reasoning models as their own verifiers.** In our experiments, <span class="model-qwen3">Qwen3</span> and <span class="model-deepseek">DeepSeek</span> show minimal self-improvement despite being strong solvers.
