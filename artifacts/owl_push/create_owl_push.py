"""Animate the owl walking the gilded writing desk across a transparent canvas.

Run with Blender 5.2+: blender --background --python create_owl_push.py
Set OWL_PREVIEW_ONLY=1 to render only the still preview.
"""

from pathlib import Path
import os
import bpy


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DESK = ROOT / "public/assets/Golden Louis XIV bureau writing desk-2.png"
POSES = HERE / "poses"
BLEND = HERE / "owl_push_desk.blend"
PREVIEW = HERE / "owl_push_desk_still.png"
FRAMES = HERE / "frames"


def image_material(name, path):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.surface_render_method = "BLENDED"
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    mix = nodes.new("ShaderNodeMixShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    links = material.node_tree.links
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(texture.outputs["Alpha"], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    return material


def image_plane(name, width, height, material, x=0, y=0, z=0):
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(
        [(-width / 2, -height / 2, 0), (width / 2, -height / 2, 0),
         (width / 2, height / 2, 0), (-width / 2, height / 2, 0)],
        [], [(0, 1, 2, 3)],
    )
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for loop, coord in zip(mesh.polygons[0].loop_indices,
                           ((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[loop].uv = coord
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z)
    obj.data.materials.append(material)
    return obj


def visible_at(obj, frame, visible):
    obj.hide_render = not visible
    obj.hide_viewport = not visible
    obj.keyframe_insert(data_path="hide_render", frame=frame)
    obj.keyframe_insert(data_path="hide_viewport", frame=frame)


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 168
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "Medium High Contrast"

# All characters share one moving parent, keeping the owl's wing tips touching
# the left side of the desk throughout the push.
cart = bpy.data.objects.new("Desk and owl travel", None)
bpy.context.collection.objects.link(cart)
for frame, x in (
    (1, -3.8), (12, -3.65), (30, -3.05), (55, -1.85),
    (83, -0.1), (110, 1.55), (136, 2.95), (158, 3.75), (168, 3.8),
):
    cart.location.x = x
    cart.keyframe_insert(data_path="location", frame=frame)

desk = image_plane("Golden Louis XIV writing desk", 7.8, 5.2,
                   image_material("writing desk image", DESK), y=-1.0)
desk.parent = cart

pose_files = (
    ("Push stride A", "push_stride_a.png"),
    ("Push lifted foot", "push_step_lift.png"),
    ("Push stride B", "push_stride_b.png"),
    ("Push reaching foot", "push_step_reach.png"),
)
sprites = []
for name, filename in pose_files:
    sprite = image_plane(name, 4.8, 3.2,
                         image_material(name + " image", POSES / filename),
                         x=-5.65, y=-2.0, z=0.10)
    sprite.parent = cart
    sprites.append(sprite)

# Four drawings give two grounded strides and two passing steps.
last_pose = None
for frame in range(1, 160):
    active = sprites[((frame - 1) // 5) % len(sprites)]
    if active is not last_pose:
        for sprite in sprites:
            visible_at(sprite, frame, sprite is active)
        last_pose = active
for sprite in sprites:
    visible_at(sprite, 160, sprite is sprites[0])

camera_data = bpy.data.cameras.new("Orthographic camera")
camera = bpy.data.objects.new("Orthographic camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, 0, 20)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 16
scene.camera = camera

scene.frame_set(95)
scene.render.filepath = str(FRAMES / "frame_")
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
scene.render.filepath = str(PREVIEW)
bpy.ops.render.render(write_still=True)
if not os.environ.get("OWL_PREVIEW_ONLY"):
    FRAMES.mkdir(exist_ok=True)
    scene.render.filepath = str(FRAMES / "frame_")
    bpy.ops.render.render(animation=True)
