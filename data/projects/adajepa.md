---
mathjax: true
equal_label: Equal advising
affiliations:
  - { name: 'Ying Wang',      aff: 'New York University' }
  - { name: 'Oumayma Bounou', aff: 'New York University' }
  - { name: 'Yann LeCun',     aff: 'New York University', url: 'http://yann.lecun.com/', equal: true }
  - { name: 'Mengye Ren',     aff: 'New York University', equal: true }
bibtex: |
  @article{wang2026adajepa,
    title   = {AdaJEPA: An Adaptive Latent World Model},
    author  = {Wang, Ying and Bounou, Oumayma and LeCun, Yann and Ren, Mengye},
    journal = {CoRR},
    year    = {2026}
  }
---

## Overview

![AdaJEPA performs a closed-loop plan-act-adapt-replan cycle. At each MPC step, the agent plans with the current world model, executes the first action, observes the next transition, updates the model using latent prediction error, and replans with the adapted model.](main_loop.png){width=900}

Latent world models make planning from high-dimensional observations tractable by predicting future states in a compact representation space. However, standard world-model planners freeze the model after training. When predictions become inaccurate under visual, shape, dynamics, or layout shifts, model predictive control can optimize actions for the wrong imagined future.

AdaJEPA addresses this by adapting the world model during deployment. Each action executed by MPC produces a new transition $(o_t, a_t, o_{t+1})$, which becomes a self-supervised training signal before the next replan. This couples learning and planning in a simple loop: plan, act, adapt, and replan.

## Method

![AdaJEPA uses a JEPA-style latent world model for goal-conditioned planning. Observations and actions are encoded into latent representations, the predictor rolls out future latents, and MPC optimizes actions by minimizing distance to the goal latent.](main_plan.png){width=520}

AdaJEPA starts from a pretrained JEPA world model with a sensory encoder $\mathcal{E}^s_\phi$, an action encoder $\mathcal{E}^a_\psi$, and a latent predictor $f_\theta$. Given a goal observation $o_g$, MPC plans in latent space by rolling out the predictor and minimizing the distance to the goal representation $z_g = \mathcal{E}^s_\phi(o_g)$:

$$
a^*_{t:t+H-1}
=
\arg\min_{a_{t:t+H-1}}
\sum_{k=1}^{H}
\alpha_k\, d(\hat z_{t+k}, z_g).
$$

After executing an action, AdaJEPA stores the observed transition in a small online buffer $\mathcal{B}$ and adapts the model by minimizing the same latent prediction objective used during pretraining:

$$
\mathcal{L}_{\rm ada}(\mathcal{B})
=
\frac{1}{|\mathcal{B}|}
\sum_{(o_i,a_i,o_{i+1})\in\mathcal{B}}
\ell\!\left(
f_\theta\!\left(z_i,\mathcal{E}^a_\psi(a_i)\right),
\operatorname{sg}(z_{i+1})
\right).
$$

In experiments, adaptation is lightweight: one gradient step per MPC replan, a replay buffer of five recent transitions, and updates restricted to the final layers of the visual encoder and predictor.

## Results

![AdaJEPA improves planning success on PushT shape shifts for both gradient-based and CEM planners. Stars denote held-out object shapes, where adaptation is especially helpful.](all_shapes_gd_cem_ttt.png){width=900}

AdaJEPA improves planning success across seen and unseen PushT object geometries. The gains are strongest on held-out shapes, where the frozen model's latent rollouts are less reliable and online adaptation helps the planner recover.

![AdaJEPA improves planning success under visual shifts including blur, salt-and-pepper noise, dark lighting, and color changes.](pusht_visual_shifts_gd_cem_ttt.png){width=900}

The same adaptation loop improves robustness to visual distribution shifts such as blur, noise, dark lighting, and color changes. Because the update uses only the transition observed during deployment, no expert demonstrations or target-domain labels are required.

![Comparison of frozen and adaptive planning on a held-out square object. AdaJEPA reduces prediction error during MPC and reaches the goal where the frozen planner fails.](example_square_ttt.png){width=900}

![PushT visual shift examples used to evaluate robustness: original observations, blur, salt-and-pepper noise, dark lighting, and red color shifts.](pusht_visual_shifts_examples.png){width=900}

## Takeaways

AdaJEPA shows that a latent world model does not have to remain fixed after offline training. Updating the model on the transitions encountered during planning can substantially improve closed-loop control, especially under test-time distribution shift.

The approach is simple to add to JEPA-style planners: keep a small online buffer, reuse the latent prediction loss at test time, adapt a small subset of parameters, and immediately replan with the updated model.
