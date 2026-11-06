"""Animate the four illustrated owl poses onto the gilded chair in Blender.

Run with Blender 5.2+: blender --background --python create_owl_flight_v2.py
Set OWL_PREVIEW_ONLY=1 to render only the landing preview.
"""

from pathlib import Path
import math
import os
import bpy


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
POSES = HERE / "poses"
CHAIR = ROOT / "public/assets/Gilded Cobalt Louis XIV Armchair-1.png"
BLEND = HERE / "owl_flight_v2_transparent.blend"
PREVIEW = HERE / "owl_flight_v2_preview.png"
FRAMES = HERE / "v2_frames"


def color(hex_value):
    return tuple(int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)


def image_material(name, path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    mix = nodes.new("ShaderNodeMixShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    links = mat.node_tree.links
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(texture.outputs["Alpha"], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    return mat


def flat_material(name, hex_value, opacity):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    mix = nodes.new("ShaderNodeMixShader")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color(hex_value)
    mix.inputs[0].default_value = opacity
    links = mat.node_tree.links
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])
    return mat


def plane(name, width, height, material, x=0, y=0, z=0):
    verts = [(-width / 2, -height / 2, 0), (width / 2, -height / 2, 0),
             (width / 2, height / 2, 0), (-width / 2, height / 2, 0)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
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


def ellipse(name, x, y, z, rx, ry, material):
    vertices = [(0, 0, 0)]
    for i in range(64):
        a = math.tau * i / 64
        vertices.append((rx * math.cos(a), ry * math.sin(a), 0))
    faces = [(0, i + 1, ((i + 1) % 64) + 1) for i in range(64)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z)
    obj.data.materials.append(material)
    return obj


def visible_at(obj, frame, is_visible):
    obj.hide_render = not is_visible
    obj.hide_viewport = not is_visible
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

chair = plane("Gilded cobalt armchair", 6.53, 5.90,
              image_material("chair cutout", CHAIR), 3.15, -0.84, 0)
contact = ellipse("contact shadow on cushion", 3.03, -1.32, 0.04,
                  0.65, 0.11, flat_material("cushion contact", "08245D", 0.25))
for frame, amount in ((1, 0), (101, 0), (111, 0.65), (117, 1), (131, 0.8)):
    contact.scale = (amount, amount, amount)
    contact.keyframe_insert(data_path="scale", frame=frame)

path = bpy.data.objects.new("Owl flight path and landing bounce", None)
bpy.context.collection.objects.link(path)
path.location.z = 0.1
flight_path = (
    (1, -9.2, -0.15, -4),
    (18, -6.6, 0.5, -3),
    (42, -3.4, 1.42, -1),
    (66, -0.35, 1.74, 1),
    (88, 1.70, 1.43, -2),
    (102, 2.62, 0.86, -4),
    (111, 3.05, 0.22, 0),
    (116, 3.05, -0.05, 0),
    (125, 3.05, 0.10, -1),
    (139, 3.05, 0.0, 0),
    (168, 3.05, 0.0, 0),
)
for frame, x, y, angle in flight_path:
    path.location = (x, y, 0.1)
    path.rotation_euler.z = math.radians(angle)
    path.keyframe_insert(data_path="location", frame=frame)
    path.keyframe_insert(data_path="rotation_euler", frame=frame)

up = plane("Flight pose - wings up", 3.0, 2.0,
           image_material("wings up sprite", POSES / "owl_flight_up.png"), z=0.02)
mid = plane("Flight pose - wings level", 3.0, 2.0,
            image_material("wings level sprite", POSES / "owl_flight_mid.png"), z=0.02)
down = plane("Flight pose - wings down", 3.0, 2.0,
             image_material("wings down sprite", POSES / "owl_flight_down.png"), y=-0.30, z=0.02)
land = plane("Landing pose - flattened", 2.45, 1.63,
             image_material("flat landing sprite", POSES / "owl_landing_flat.png"), y=-0.30, z=0.03)
sprites = (up, mid, down)
for sprite in (*sprites, land):
    sprite.parent = path

# Swap genuinely different illustrations on a twelve-frame flap cycle.
last = None
for frame in range(1, 112):
    phase = (frame - 1) % 12
    active = up if phase < 3 else mid if phase < 6 or phase >= 9 else down
    if active is not last:
        for sprite in sprites:
            visible_at(sprite, frame, sprite is active)
        last = active
for sprite in sprites:
    visible_at(sprite, 112, False)
visible_at(land, 1, False)
visible_at(land, 112, True)

# The landing art itself is low and wide. A brief impact compresses it further.
for frame, scale in ((1, (1, 1, 1)), (111, (1, 1, 1)),
                     (116, (1.07, 0.89, 1)), (125, (0.98, 1.04, 1)),
                     (139, (1, 1, 1))):
    land.scale = scale
    land.keyframe_insert(data_path="scale", frame=frame)

camera_data = bpy.data.cameras.new("Orthographic camera")
camera = bpy.data.objects.new("Orthographic camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, 0, 20)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 16
scene.camera = camera

scene.frame_set(140)
scene.render.filepath = str(FRAMES / "frame_")
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
scene.render.filepath = str(PREVIEW)
bpy.ops.render.render(write_still=True)
if not os.environ.get("OWL_PREVIEW_ONLY"):
    FRAMES.mkdir(exist_ok=True)
    scene.render.filepath = str(FRAMES / "frame_")
    bpy.ops.render.render(animation=True)
