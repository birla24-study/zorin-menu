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
 * This file is based on code from the ArcMenu extension by
 * LinxGem33, Andrew Zaech, and Alexander Rüedlinger
 */

// Import Libraries
const {Gio, GObject, Shell} = imports.gi;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Constants = Me.imports.constants;

// The Menu Keybinder class manages keybindings for the menu
var MenuKeybinder = class {
    constructor(menuToggler) {
        this._menuToggler = menuToggler;
        this.hotKeyEnabled = false;
        this._ignoreHotKeyChangedEvent = false;
        this._mutterSettings = new Gio.Settings({ 'schema': Constants.MUTTER_SCHEMA });
        this._wmKeybindings = new Gio.Settings({ 'schema': Constants.WM_KEYBINDINGS_SCHEMA });
        this._oldOverlayKey = this._mutterSettings.get_value('overlay-key');
        this._overlayKeyChangedID = this._mutterSettings.connect('changed::overlay-key', () => {
            if(!this._ignoreHotKeyChangedEvent)
                this._oldOverlayKey = this._mutterSettings.get_value('overlay-key');
        });
        this._mainStartUpCompleteID = Main.layoutManager.connect('startup-complete', () => this._setHotKey());
    }

    // Set Main.overview.toggle to toggle Zorin Menu instead
    enableHotKey() {
        this._ignoreHotKeyChangedEvent = true;
        this._mutterSettings.set_string('overlay-key', 'SUPER_L');
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL |
            Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP);
        this.hotKeyEnabled =  true;
        if(!Main.layoutManager._startingUp)
            this._setHotKey();
        this._ignoreHotKeyChangedEvent = false;
    }

    // Set Main.overview.toggle to default function and default hotkey
    disableHotKey() {
        this._ignoreHotKeyChangedEvent = true;
        this._mutterSettings.set_value('overlay-key', this._oldOverlayKey);
        if(this.overlayKeyID){
            global.display.disconnect(this.overlayKeyID);
            this.overlayKeyID = null;
        }
        if(this.defaultOverlayKeyID){
            GObject.signal_handler_unblock(global.display, this.defaultOverlayKeyID);
            this.defaultOverlayKeyID = null;
        }
        Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
        this.hotKeyEnabled = false; 
        this._ignoreHotKeyChangedEvent = false;
    }

    // Update hotkey menu toggle function
    _setHotKey() {
        if(this.hotKeyEnabled){
            Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL |
            Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP);

            //Find signal ID in Main.js that connects 'overlay-key' to global.display and toggles Main.overview
            let [bool,signal_id, detail] = GObject.signal_parse_name('overlay-key', global.display, true);
            this.defaultOverlayKeyID = GObject.signal_handler_find(global.display, GObject.SignalMatchType.ID, signal_id, detail, null, null, null); 

            //If signal ID found, block it and connect new 'overlay-key' to toggle Zorin Menu.
            if(this.defaultOverlayKeyID){
                GObject.signal_handler_block(global.display, this.defaultOverlayKeyID);
                this.overlayKeyID = global.display.connect('overlay-key', () => {
                    this._menuToggler();
                });
            }
            else
                global.log("Zorin Menu error: Failed to set Super_L hotkey");
        }
    }

    // Destroy this object
    destroy() {
        // Clean up and restore the default behaviour
        if(this._overlayKeyChangedID){
            this._mutterSettings.disconnect(this._overlayKeyChangedID);
            this._overlayKeyChangedID = null;
        }
        this.disableHotKey();
        if (this._mainStartUpCompleteID) {
            Main.layoutManager.disconnect(this._mainStartUpCompleteID);
            this._mainStartUpCompleteID = null;
        }
    }
};
