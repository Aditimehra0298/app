"""Rounded-dot QR codes matching the SFT LMS verify style."""

from __future__ import annotations

import io
from typing import Any


def make_verify_qr_image(data: str) -> Any:
    """Black circular-dot QR on white, same look as the sftlms.com verify code."""
    import qrcode
    from qrcode.constants import ERROR_CORRECT_H

    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=12, border=2)
    qr.add_data(str(data or "").strip())
    qr.make(fit=True)

    try:
        from qrcode.image.styledpil import StyledPilImage
        from qrcode.image.styles.colormasks import SolidFillColorMask

        try:
            from qrcode.image.styles.moduledrawers.pil import CircleModuleDrawer
        except ImportError:
            from qrcode.image.styles.moduledrawers import CircleModuleDrawer

        return qr.make_image(
            image_factory=StyledPilImage,
            module_drawer=CircleModuleDrawer(),
            color_mask=SolidFillColorMask(back_color=(255, 255, 255), front_color=(0, 0, 0)),
        )
    except Exception:
        return qr.make_image(fill_color="black", back_color="white")


def qr_png_bytes(data: str) -> bytes:
    image = make_verify_qr_image(data)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
