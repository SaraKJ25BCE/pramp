"""
CNN-based perceptual embeddings for robust image similarity matching.

Uses EfficientNet-B0 (lighter than ResNet50) to produce a 1280-dim
L2-normalized feature vector. Cosine similarity between vectors is far
more robust to crops, overlays, compression, and style transfer than
classical perceptual hashes.
"""

import numpy as np
from PIL import Image

try:
    import torch
    import torch.nn.functional as F
    from torchvision import models, transforms

    _model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
    _model.classifier = torch.nn.Identity()
    _model.eval()

    _transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    EMBEDDING_DIM = 1280
    TORCH_AVAILABLE = True

except ImportError:
    TORCH_AVAILABLE = False
    EMBEDDING_DIM = 1280
    _model = None
    _transform = None


def compute_embedding(pil_image: Image.Image) -> list[float]:
    """
    Compute an L2-normalized CNN feature embedding from a PIL Image.

    Args:
        pil_image: RGB PIL Image

    Returns:
        List of floats (1280-dim, unit-normalized)

    Raises:
        RuntimeError if torch is not installed
    """
    if not TORCH_AVAILABLE:
        raise RuntimeError(
            "PyTorch is not installed. Install with: "
            "pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu"
        )

    if pil_image.mode != 'RGB':
        pil_image = pil_image.convert('RGB')

    tensor = _transform(pil_image).unsqueeze(0)

    with torch.no_grad():
        embedding = _model(tensor)

    # L2 normalize
    embedding = F.normalize(embedding, p=2, dim=1)

    return embedding.squeeze().tolist()


def cosine_similarity(embedding_a: list[float], embedding_b: list[float]) -> float:
    """
    Compute cosine similarity between two embeddings.
    Both should be L2-normalized, so dot product equals cosine similarity.
    """
    a = np.array(embedding_a, dtype=np.float32)
    b = np.array(embedding_b, dtype=np.float32)
    return float(np.dot(a, b))
