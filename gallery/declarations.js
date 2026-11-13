// Local self-contained OpenVGAL configuration.
const openvgal_location = '.';
const cdn_base = '';
const is_preview = false;
const glb_location = './templates/';
const config_file_name = './building_v2.json';
const materials_folder = './materials';
const hallspics_prefix = '.';
window.resolveImageUrl = path => hallspics_prefix + path;
const regul_exp_door = /^d_/;
const regul_exp_tail = /_[0-9]*$/;
const regul_exp_artworks = /_\d{1,3}$/;
const frame_material = 'BJS_white';
