---
mathjax: true
affiliations:
  - { name: 'Yuen-Hei Yeung',   aff: 'New York University', url: 'https://xavhl.github.io/' }
  - { name: 'Chris Hoang',       aff: 'New York University', url: 'https://www.chrishoang.com/' }
  - { name: 'Zifan Zhao',       aff: 'New York University', url: 'http://zifanzhao.com/' }
  - { name: 'Mengye Ren',       aff: 'New York University' }
bibtex: |
  @article{yeung2026canonical,
    title   = {Canonical Observation Pretraining for Visuomotor Control},
    author  = {Yeung, Yuen-Hei and Hoang, Christopher and Zhao, Zifan and Ren, Mengye},
    journal = {arXiv preprint},
    year    = {2026}
  }
---

## Problem: visuomotor policies are brittle to camera viewpoint {data-toc=Problem}

Visuomotor policies learned from human demonstrations are brittle to camera viewpoint changes. Existing remedies each make a different assumption: novel-view synthesis requires a rendering pipeline, equivariant architectures require 3D inputs or symmetry hard-coded into the network, and view-invariant pretraining requires only multi-view RGB but does not model how a viewpoint change acts on the features.

## Method: viewpoint as a recoverable latent rotation {data-toc=Method}

![Canonical pretraining (top) and self-calibrating inference (bottom).](method.png){width=900}

We present **Canonical**, a self-supervised pretraining method that instead keeps viewpoint as a recoverable latent factor, modeling camera viewpoint change as a rotation in $SO(3)$ and warping features into a shared canonical frame before a standard behavior-cloned policy that needs no viewpoint-specific changes.

Canonical consists of a visual encoder $f_\phi$ that maps observations to spatial feature maps $\mathbf{z}$; a lightweight view predictor $g_\omega$ that estimates the camera rotation relative to the canonical viewpoint, supervised by a geodesic distance loss $\mathcal{L}_\text{angle}$; a rotation projector $P_\eta$ that maps a continuous 6D rotation representation to a rotation latent; and a transformer-based view forward module $h_\psi$ that maps features between viewpoints conditioned on that latent. During pretraining, a symmetric canonical-consistency loss $\mathcal{L}_\text{canonical}$ and a cross-view loss $\mathcal{L}_\text{xview}$ are applied over paired multi-view observations, with VICReg regularization to prevent collapse.

Pretraining consumes multi-view RGB and one rotation label per camera. At deployment, no pose information is required: the encoder and view predictor infer $\hat{\mathbf{R}} \in SO(3)$ from a single observation, and features are warped into the canonical space before reaching the policy.

## Results: generalization to unseen camera viewpoints {data-toc=Results}

Canonical generalizes to camera viewpoints unseen by the policy, reaching $0.87$ success at pretraining-pool views and $0.78$ outside the pool on vision-only LIBERO-Goal against the strongest multi-view baseline's $0.65$ and $0.50$; on MetaWorld's main camera split it is the only tested visual representation that does not degrade a proprioceptive policy under viewpoint shift, and it remains the strongest method at viewpoints unseen by the policy on a real-world xArm robot.

### SO(3) viewpoint variation: MetaWorld

MetaWorld tests viewpoint shifts with fixed cameras spanning azimuth *and* elevation; a policy trained from a single canonical view is evaluated as the camera circles the scene.

![MetaWorld per-task success rates under SO(3) viewpoint variation, averaged over in-distribution (ID) and out-of-distribution (OOD) cameras.](metaworld.png){width=900}

![Per-camera success across the ten rollout azimuths (green = ID, red = OOD; dashed = canonical training view). Canonical (cyan) stays flat where the baselines peak at the training view and fall off.](sweep_mw.png){width=900}

### Long-horizon manipulation: LIBERO-Goal

LIBERO-Goal adds a distinct robot embodiment, a richer scene, and multi-step tasks (for example, opening a drawer and then placing a bowl inside), testing whether the canonicalization carries over to long-horizon control. Occlusion from tabletop objects limits the meaningful azimuth range to roughly &plusmn;20&deg;.

![LIBERO-Goal success rates under azimuth variation, averaged over ID and OOD cameras.](libero.png){width=480}

![Per-camera success across the ten headline evaluation cameras, -20 to +25 degrees (dashed = training view theta = 0; shaded bands mark in- vs. out-of-distribution cameras). Canonical (cyan) stays well above every baseline across the full range. Success for all methods, including Canonical, falls toward zero beyond this range (+/-30 / +/-40 degrees) as tabletop objects occlude the workspace.](sweep_libero.png){width=900}

### Real-world robot: xArm

We validate Canonical on a physical UFACTORY xArm 7 across three manipulation tasks: button press, pick-and-place, and drawer close. The policy is trained from a single canonical camera at 300&deg; and, at test time, is deployed with no pose information provided. Each task is evaluated at two in-distribution encoder-pretraining angles (160&deg; and the 300&deg; training camera) and two out-of-distribution angles (250&deg;, 280&deg;), 10 trials each; three of the four test angles are unseen by the policy.

![Success rates on xArm, pooled over each split's two cameras (20 trials per split). ID: the in-distribution encoder-pretraining cameras (160, 300 degrees); OOD: the held-out cameras (280, 250 degrees).](xarm.png){width=600}

At test time, Canonical estimates the camera rotation from the observation and canonicalizes features before they reach the policy. Each video below shows a representative rollout from a held-out camera view.

![Button press, rolled out from a held-out camera view.](buttonpress.mp4){width=420}

![Pick-and-place, rolled out from a held-out camera view.](pickplace.mp4){width=420}

![Drawer close, rolled out from a held-out camera view.](drawerclose.mp4){width=420}

## Analysis: viewpoint is preserved, not discarded {data-toc=Analysis}

Canonical generalizes where view-invariant methods fail because it preserves viewpoint as a recoverable latent factor instead of discarding it. On MetaWorld, we freeze each encoder and fit a linear least-squares probe on its features to predict $\cos\theta$ and $\sin\theta$ of the camera azimuth $\theta$ (the encoder is never updated), then place each sample at its predicted $(\cos,\sin)$.

![Linear decodability of camera azimuth from frozen features: each point at its predicted (cos theta, sin theta), colored by ground-truth azimuth (a viewpoint-aware encoder traces a rainbow-ordered circle). Canonical (left) recovers azimuth near-perfectly (R^2 = 1.00, circular RMSE 0.09 degrees); VILA (right) also recovers azimuth but with more scatter (R^2 = 1.00, 1.76 degrees); ReViWo (center) collapses to a blob (R^2_sin = 0.04, R^2_cos = 0.09, 90.8 degrees), reflecting its view-invariant objective.](analysis_azimuth_prediction.png){width=900}

The same canonicalization is visible directly in pixel space. On the real xArm, we freeze each encoder and train a small decoder to invert the policy-facing feature back to an image with a pixel reconstruction loss; the encoder is never updated, so the decoder can only surface what the feature already encodes. At test time we decode each method's policy-facing feature and check whether it matches the shared canonical view.

![xArm decoder probe. From in-distribution (ID) and out-of-distribution (OOD) cameras, we decode each method's policy-facing features back to an image and compare it to the canonical ground-truth view (far left). Canonical is the only method that moves toward the canonical frame; ReViWo's view-invariant features collapse to blur, while VILA reproduces the original source view rather than canonicalizing it. Rows: drawer-close, pick-and-place, button-press.](xarm_decoder.png){width=900}

![Decoder Delta-SSIM by method (ID / OOD). Delta-SSIM = SSIM(decoded, canonical) - SSIM(decoded, source), mean over three tasks; positive means the reconstruction moves toward the canonical view.](ssim_table.png){width=420}

## Conclusion {data-toc=Conclusion}

Canonical models camera viewpoint change as a rotation in $SO(3)$, enabling visuomotor policies trained from a single viewpoint to generalize to unseen camera angles without calibration. Three next steps follow directly from Canonical's learned latent operator rather than from explicit 3D geometry: making the self-calibrating angle predictor **uncertainty-aware**, predicting a distribution over the camera rotation instead of committing to a single point estimate; **fusing multiple cameras** by warping each view into the same canonical latent frame before combining their features; and **cross-dataset pretraining** around a shared semantic canonical pose, such as a frontal view relative to the robot base, rather than an arbitrary camera index defined separately per dataset. The same latent-operator formulation may be useful for other structured visual shifts, but this work studies camera viewpoint.
