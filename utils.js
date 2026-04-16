/*
 * Zorin Menu: The official applications menu for Zorin OS.
 *
 * Copyright (C) 2016-2021 Zorin OS Technologies Ltd.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Credits:
 * This file contains code from the Applications Menu extension by easy2002
 * and Debarshi Ray
 */
const {Clutter, Gio, GLib, St} = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;

Gio._promisify(Gio._LocalFilePrototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio._LocalFilePrototype, 'set_attributes_async', 'set_attributes_finish');

async function _markTrusted(file) {
    let modeAttr = Gio.FILE_ATTRIBUTE_UNIX_MODE;
    let queryFlags = Gio.FileQueryInfoFlags.NONE;
    let ioPriority = GLib.PRIORITY_DEFAULT;
    let S_IXUSR = 0o00100;

    try {
        let info = await file.query_info_async(modeAttr, queryFlags, ioPriority, null);
        let mode = info.get_attribute_uint32(modeAttr) | S_IXUSR;
        info.set_attribute_uint32(modeAttr, mode);
        info.set_attribute_string('metadata::trusted', 'true');
        await file.set_attributes_async(info, queryFlags, ioPriority, null);

        // Hack: force nautilus to reload file info
        info = new Gio.FileInfo();
        info.set_attribute_uint64(
            Gio.FILE_ATTRIBUTE_TIME_ACCESS, GLib.get_real_time());
        try {
            await file.set_attributes_async(info, queryFlags, ioPriority, null);
        } catch (e) {
            log(`Failed to update access time: ${e.message}`);
        }
    } catch (e) {
        log(`Failed to mark file as trusted: ${e.message}`);
    }
};


function addToDesktop(appInfo) {
    if (!appInfo)
        return;

    let desktop = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    let src = Gio.File.new_for_path(appInfo.get_filename());
    let dst = Gio.File.new_for_path(GLib.build_filenamev([desktop, src.get_basename()]));

    try {
        // copy_async() isn't introspectable :-(
        src.copy(dst, Gio.FileCopyFlags.OVERWRITE, null, null);
        _markTrusted(dst);
    } catch (e) {
        log(`Failed to copy to desktop: ${e.message}`);
    }
};

function getSettingsForExtension(extension, schema) {

    if (!extension)
        throw new Error('getSettingsForExtension() cannot be called with null extension');

    schema = schema || extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // Expect USER extensions to have a schemas/ subfolder, otherwise assume a
    // SYSTEM extension that has been installed in the same prefix as the shell
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;
    if (schemaDir.query_exists(null)) {
        schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
                                                 GioSSS.get_default(),
                                                 false);
    } else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error(`Schema ${schema} could not be found for extension ${extension.metadata.uuid}. Please check your installation`);

    return new Gio.Settings({ settings_schema: schemaObj });
}

/**
 * Check if an app exists in the system.
 */
var checkedCommandsMap = new Map();

function checkIfCommandExists(app) {
    let answer = checkedCommandsMap.get(app);
    if (answer === undefined) {
        // Command is a shell built in, use shell to call it.
        // Quotes around app value are important. They let command operate
        // on the whole value, instead of having shell interpret it.
        let cmd = "sh -c 'command -v \"" + app + "\"'";
        try {
            let out = GLib.spawn_command_line_sync(cmd);
            // out contains 1: stdout, 2: stderr, 3: exit code
            answer = out[3] == 0;
        } catch (ex) {
            answer = false;
        }

        checkedCommandsMap.set(app, answer);
    }
    return answer;
}

// modified from GNOME shell's ensureActorVisibleInScrollView()
function ensureActorVisibleInScrollView(actor, axis = Clutter.Orientation.VERTICAL) {
    let box = actor.get_allocation_box();
    let {y1} = box, {y2} = box;
    let {x1} = box, {x2} = box;

    let parent = actor.get_parent();
    while (!(parent instanceof St.ScrollView)) {
        if (!parent)
            return;

        box = parent.get_allocation_box();
        y1 += box.y1;
        y2 += box.y1;
        x1 += box.x1;
        x2 += box.x1;
        parent = parent.get_parent();
    }

    let adjustment, startPoint, endPoint;

    if (axis === Clutter.Orientation.VERTICAL) {
        adjustment = parent.vscroll.adjustment;
        startPoint = y1;
        endPoint = y2;
    } else {
        adjustment = parent.hscroll.adjustment;
        startPoint = x1;
        endPoint = x2;
    }

    let [value, lower_, upper, stepIncrement_, pageIncrement_, pageSize] = adjustment.get_values();

    let offset = 0;
    const fade = parent.get_effect('fade');
    if (fade)
        offset = axis === Clutter.Orientation.VERTICAL ? fade.fade_margins.top : fade.fade_margins.left;

    if (startPoint < value + offset)
        value = Math.max(0, startPoint - offset);
    else if (endPoint > value + pageSize - offset)
        value = Math.min(upper, endPoint + offset - pageSize);
    else
        return;

    blockHover();

    adjustment.ease(value, {
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        duration: Constants.SCROLL_ANIMATION_DURATION,
    });
}

var Blocker = class {
    constructor() {
        this._blockActivate = false;
        this._blockHover = false;
    }

    get blockActivate() {
        return this._blockActivate;
    }

    set blockActivate(block) {
        this._blockActivate = block;
    }

    get blockHover() {
        return this._blockHover;
    }

    set blockHover(block) {
        this._blockHover = block;
    }
};

var blocker = new Blocker();

function isBlockActivate() {
    return blocker.blockActivate;
}

function blockActivate(block = true) {
    blocker.blockActivate = block;
}

function isBlockHover() {
    return blocker.blockHover;
}

function blockHover(block = true) {
    blocker.blockHover = block;
}

function getSettingsJson(settings, setting) {
    try {
        return JSON.parse(settings.get_string(setting));
    } catch(e) {
        log('Error parsing JSON setting: ' + e.message);
    }
}

function getSettingPanelPosition(settings, index) {
    var positions = null;
    var side = 'NONE';

    try {
        positions = JSON.parse(settings.get_string('panel-positions'));
        side = positions[index];
    } catch (e) {
        log(`Error parsing panel position setting: ${e.message}`);
    }

    if (side === 'TOP')
        return St.Side.TOP;
    else if (side === 'RIGHT')
        return St.Side.RIGHT;
    else if (side === 'BOTTOM')
        return St.Side.BOTTOM;
    else if (side === 'LEFT')
        return St.Side.LEFT;
    else
        return St.Side.BOTTOM;
}
