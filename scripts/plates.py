# Converts the approved illustration plates (assets/plates/*.png) into the web copies in public/plates/.
# Run once after a plate changes: python scripts/plates.py  (needs Pillow)
from PIL import Image, ImageOps

SRC, OUT = "assets/plates/", "public/plates/"


def save(img, name, width=None, quality=82):
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(OUT + name, "WEBP", quality=quality, method=6)
    print(name, img.size)


def nine_slice(name, top, band_end, left_paper):
    """Tag with the eyelet kept whole in the top slice and a mirror-tileable middle band,
    so the tag grows taller (border-image-repeat: round) without stretching the eyelet.
    Layout: rows [0,top) + band + flipped band + rows [top,end). At native height the
    middle collapses and the plate looks exactly as approved."""
    tag = Image.open(SRC + name + ".png")
    band = tag.crop((0, top, tag.width, band_end))
    # The eyelet ring's lower rim reaches into the band: cover those columns with plain paper.
    band.paste(band.crop((260, 0, 380, band.height)), (left_paper, 0))
    out = Image.new("RGBA", (tag.width, tag.height + 2 * band.height))
    out.paste(tag.crop((0, 0, tag.width, top)), (0, 0))
    out.paste(band, (0, top))
    out.paste(ImageOps.flip(band), (0, top + band.height))
    out.paste(tag.crop((0, top, tag.width, tag.height)), (0, top + 2 * band.height))
    print(name, "slices: top", top, "middle", 2 * band.height, "bottom", tag.height - top)
    save(out, name + ".webp")


save(Image.open(SRC + "hero.png"), "hero.webp")
save(Image.open(SRC + "brand-mark.png"), "brand-mark.webp", 400)
save(Image.open(SRC + "search-tag.png"), "search-tag.webp", 1860)
save(Image.open(SRC + "twine-search.png"), "twine-search.webp", 260)
save(Image.open(SRC + "twine-fairs.png"), "twine-fairs.webp", 280)
save(Image.open(SRC + "ground.png"), "ground.webp", quality=78)
nine_slice("fair-tag-1", 222, 245, 60)
nine_slice("fair-tag-2", 230, 256, 92)
