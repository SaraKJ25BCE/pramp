"""
Robust DWT-DCT watermarking implementation.

Embeds binary data into the mid-frequency DCT coefficients of the DWT subbands.
This approach survives JPEG compression, format conversion, and mild edits
because mid-frequency coefficients are preserved by lossy codecs.
"""

import numpy as np
from scipy.fft import dct, idct
import pywt


BLOCK_SIZE = 8
ALPHA = 5.0  # embedding strength — higher = more robust but more visible


def _text_to_bits(text: str) -> list[int]:
    """Convert text to a list of bits."""
    bits = []
    for char in text.encode('utf-8'):
        for i in range(7, -1, -1):
            bits.append((char >> i) & 1)
    return bits


def _bits_to_text(bits: list[int]) -> str:
    """Convert a list of bits back to text."""
    chars = []
    for i in range(0, len(bits), 8):
        byte_bits = bits[i:i+8]
        if len(byte_bits) < 8:
            break
        byte_val = 0
        for bit in byte_bits:
            byte_val = (byte_val << 1) | bit
        chars.append(byte_val)
    return bytes(chars).decode('utf-8', errors='replace').rstrip('\x00')


def embed(image: np.ndarray, message: str) -> np.ndarray:
    """
    Embed a message into an image using DWT-DCT.

    Args:
        image: RGB uint8 numpy array (H, W, 3)
        message: string to embed

    Returns:
        Watermarked RGB uint8 numpy array
    """
    img = image.astype(np.float64)

    # Work on the luminance channel (Y in YCbCr)
    # Convert RGB to YCbCr
    y = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]
    cb = -0.169 * img[:,:,0] - 0.331 * img[:,:,1] + 0.500 * img[:,:,2] + 128
    cr = 0.500 * img[:,:,0] - 0.419 * img[:,:,1] - 0.081 * img[:,:,2] + 128

    # Apply 2-level DWT on Y channel
    coeffs = pywt.dwt2(y, 'haar')
    cA, (cH, cV, cD) = coeffs

    # Embed into the LL subband (most robust to compression)
    h, w = cA.shape
    bits = _text_to_bits(message)
    # Pad message with length prefix (16 bits for message length in bits)
    msg_len = len(bits)
    len_bits = [(msg_len >> i) & 1 for i in range(15, -1, -1)]
    all_bits = len_bits + bits

    # Process blocks in LL subband
    blocks_h = h // BLOCK_SIZE
    blocks_w = w // BLOCK_SIZE
    bit_idx = 0

    for bh in range(blocks_h):
        for bw in range(blocks_w):
            if bit_idx >= len(all_bits):
                break
            # Extract block
            block = cA[bh*BLOCK_SIZE:(bh+1)*BLOCK_SIZE, bw*BLOCK_SIZE:(bw+1)*BLOCK_SIZE]
            # Apply DCT
            dct_block = dct(dct(block, axis=0, norm='ortho'), axis=1, norm='ortho')
            # Embed bit in mid-frequency coefficient (4,3)
            bit = all_bits[bit_idx]
            coeff = dct_block[4, 3]
            if bit == 1:
                dct_block[4, 3] = abs(coeff) + ALPHA
            else:
                dct_block[4, 3] = -(abs(coeff) + ALPHA)
            # Inverse DCT
            block_out = idct(idct(dct_block, axis=1, norm='ortho'), axis=0, norm='ortho')
            cA[bh*BLOCK_SIZE:(bh+1)*BLOCK_SIZE, bw*BLOCK_SIZE:(bw+1)*BLOCK_SIZE] = block_out
            bit_idx += 1
        if bit_idx >= len(all_bits):
            break

    # Inverse DWT
    y_out = pywt.idwt2((cA, (cH, cV, cD)), 'haar')
    # Trim to original size
    y_out = y_out[:y.shape[0], :y.shape[1]]

    # Convert back to RGB
    r = y_out + 1.402 * (cr - 128)
    g = y_out - 0.344 * (cb - 128) - 0.714 * (cr - 128)
    b = y_out + 1.772 * (cb - 128)

    result = np.stack([r, g, b], axis=2)
    result = np.clip(result, 0, 255).astype(np.uint8)
    return result


def extract(image: np.ndarray, expected_length: int = 13) -> str | None:
    """
    Extract a message from a watermarked image using DWT-DCT.

    Args:
        image: RGB uint8 numpy array (H, W, 3)
        expected_length: expected number of characters in the message

    Returns:
        Extracted message string, or None if extraction fails
    """
    img = image.astype(np.float64)

    # Convert RGB to Y
    y = 0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]

    # Apply 2-level DWT
    coeffs = pywt.dwt2(y, 'haar')
    cA, (cH, cV, cD) = coeffs

    h, w = cA.shape
    blocks_h = h // BLOCK_SIZE
    blocks_w = w // BLOCK_SIZE

    # Extract bits
    extracted_bits = []
    max_bits = 16 + expected_length * 8  # length prefix + message

    for bh in range(blocks_h):
        for bw in range(blocks_w):
            if len(extracted_bits) >= max_bits:
                break
            block = cA[bh*BLOCK_SIZE:(bh+1)*BLOCK_SIZE, bw*BLOCK_SIZE:(bw+1)*BLOCK_SIZE]
            dct_block = dct(dct(block, axis=0, norm='ortho'), axis=1, norm='ortho')
            coeff = dct_block[4, 3]
            extracted_bits.append(1 if coeff > 0 else 0)
        if len(extracted_bits) >= max_bits:
            break

    if len(extracted_bits) < 16:
        return None

    # Read length prefix
    msg_len = 0
    for i in range(16):
        msg_len = (msg_len << 1) | extracted_bits[i]

    # Sanity check
    if msg_len <= 0 or msg_len > 256:
        return None

    msg_bits = extracted_bits[16:16 + msg_len]
    if len(msg_bits) < msg_len:
        return None

    try:
        message = _bits_to_text(msg_bits)
        return message
    except Exception:
        return None
