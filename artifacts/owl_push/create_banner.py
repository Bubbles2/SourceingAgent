"""Render the desk-pushing scene as a wide, shallow transparent web banner."""

from pathlib import Path
import os
import bpy


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "owl_push_desk.blend"
BANNER_BLEND = HERE / "owl_push_banner.blend"
STILL = HERE / "owl_push_banner.png"
FRAMES = HERE / "banner_frames"

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
cart = bpy.data.objects["Desk and owl travel"]
cart.scale = (0.65, 0.65, 1.0)
scene.camera.location.y = -0.4
scene.render.resolution_x = 1200
scene.render.resolution_y = 300
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

scene.frame_set(160)
scene.render.filepath = str(FRAMES / "frame_")
bpy.ops.wm.save_as_mainfile(filepath=str(BANNER_BLEND))
scene.render.filepath = str(STILL)
bpy.ops.render.render(write_still=True)

if not os.environ.get("OWL_PREVIEW_ONLY"):
    FRAMES.mkdir(exist_ok=True)
    for output_index in range(1, 85):
        scene.frame_set(2 * output_index - 1)
        scene.render.filepath = str(FRAMES / f"frame_{output_index:04d}.png")
        bpy.ops.render.render(write_still=True)
