# modusHochskalieren.py — Teil von modusBilder.js: <work>/in/*.png mit einem ESRGAN-Modell hochrechnen -> <work>/out/*.png.
# Läuft in der Python-Umgebung von ComfyUI (torch + spandrel), auf der Grafikkarte, falls vorhanden.
# Transparente Pixel bekommen vorher die Farbe ihrer Nachbarn ("Ausbluten"): sonst zieht das Modell an den Kanten die
# (meist schwarzen) Farbwerte unsichtbarer Pixel mit hinein und es entstehen dunkle Säume. Alpha wird getrennt als
# Graubild durch dasselbe Modell gerechnet.
# Aufruf: python -I modusHochskalieren.py <modell.pth> <work>
import os
import sys

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from spandrel import ModelLoader

model_path, work = sys.argv[1], sys.argv[2]
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
model = ModelLoader().load_from_file(model_path).to(dev).eval()
print('Modell:', model.architecture.name, 'x', model.scale, 'auf', dev)

src_dir = os.path.join(work, 'in')
out_dir = os.path.join(work, 'out')
os.makedirs(out_dir, exist_ok=True)
kernel = torch.ones(1, 1, 3, 3, device=dev)


def bleed(rgb, alpha, steps=96):
    """Farbe sichtbarer Pixel schrittweise in die durchsichtigen schieben."""
    known = (alpha > 0.05).float()
    filled = rgb * known
    for _ in range(steps):
        if known.min() > 0:
            break
        num = F.conv2d(filled.unsqueeze(1), kernel, padding=1).squeeze(1)
        den = F.conv2d(known.unsqueeze(0), kernel, padding=1)[0]
        reach = (den > 0).float()
        fresh = (1 - known) * reach
        filled = filled * known + fresh * num / den.clamp(min=1e-6)
        known = torch.maximum(known, reach)
    return filled


with torch.inference_mode():
    for name in sorted(os.listdir(src_dir)):
        if not name.lower().endswith('.png'):
            continue
        img = np.asarray(Image.open(os.path.join(src_dir, name)).convert('RGBA')).astype(np.float32) / 255.0
        t = torch.from_numpy(img).permute(2, 0, 1).to(dev)
        rgb, alpha = t[:3], t[3:4]
        rgb = bleed(rgb, alpha)
        up_rgb = model(rgb.unsqueeze(0)).clamp(0, 1)[0]
        up_a = model(alpha.repeat(3, 1, 1).unsqueeze(0)).clamp(0, 1)[0].mean(0, keepdim=True)
        out = torch.cat([up_rgb, up_a], 0).permute(1, 2, 0).cpu().numpy()
        Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(out_dir, name))
        print(name, img.shape[1], 'x', img.shape[0], '->', out.shape[1], 'x', out.shape[0])
