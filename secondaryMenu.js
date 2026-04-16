/*
 * Zorin Menu: The official applications menu for Zorin OS.
 *
 * Copyright (C) 2016-2023 Zorin OS Technologies Ltd.
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
 */

const {Clutter, Gio, GLib, St} = imports.gi;
const Main = imports.ui.main;
const Util = imports.misc.util;
const AppMenu = imports.ui.appMenu;
const PopupMenu = imports.ui.popupMenu;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Utils = Me.imports.utils;

var AppItemMenu = class AppItemMenu extends AppMenu.AppMenu {
    constructor(source) {
        super(source, St.Side.TOP);
        this._enableFavorites = true;
        this._showSingleWindows = true;

        this._newWindowItem.connect('activate', () => this.emit('activate-window'));
        this._onGpuMenuItem.connect('activate', () => this.emit('activate-window'));
        this._detailsItem.connect('activate', () => this.emit('activate-window'));
        this._windowSection.connect('activate', () => this.emit('activate-window'));
        this._actionSection.connect('activate', () => this.emit('activate-window'));

        this._addToDesktopItem = new PopupMenu.PopupMenuItem(_("Add to Desktop"));
        this._addToDesktopItem.connect('activate', () => {
            this._onAddToDesktopActivated();
        });
        this.addMenuItem(this._addToDesktopItem, 7);
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 8);

        this.setApp(source.app);

        Main.uiGroup.add_child(this.actor);
        this.sourceActor.connect('destroy', () => {
            if (this.isOpen)
                this.close();
            Main.uiGroup.remove_child(this.actor);
            this.destroy();
        });
        this.actor.connect('key-press-event', this._menuKeyPress.bind(this));
    }

    setApp(app) {
        super.setApp(app);
        this._updateAddToDesktopItem();
    }

    _updateAddToDesktopItem() {
        if (!this._app) {
            this._addToDesktopItem.visible = false;
            return;
        }
        this._addToDesktopItem.visible = true;

        let desktop = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        let file = Gio.File.new_for_path(GLib.build_filenamev([desktop, this._app.get_id()]));
        let exists = (!file.query_exists(null));

        this._addToDesktopItem.label.text = exists ?  _("Add to Desktop")
            : _("Remove from Desktop");
    }

    _onAddToDesktopActivated() {
        if (!this._app) {
            this._updateAddToDesktopItem();
            return;
        }

        let desktop = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        let file = Gio.File.new_for_path(GLib.build_filenamev([desktop, this._app.get_id()]));
        if (!file.query_exists(null)){
            Utils.addToDesktop(this._app.app_info);
        } else {
            try {
                file.delete(null);
            } catch (e) {
                log(`Failed to delete desktop shortcut: ${e.message}`);
            }
        }

        this._updateAddToDesktopItem();
    }

    _onKeyPress() {
        return Clutter.EVENT_PROPAGATE;
    }

    open(animate) {
        super.open(animate);
        this.sourceActor.add_style_pseudo_class('active');
    }

    close(animate) {
        super.close(animate);
        this.sourceActor.remove_style_pseudo_class('active');
        this.sourceActor.sync_hover();
    }

    _menuKeyPress(actor, event) {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Menu) {
            this.toggle();
            this.sourceActor.sync_hover();
        }
    }
};

var ButtonMenu = class ButtonMenu extends PopupMenu.PopupMenu {
    constructor(source) {
        super(source, 0.5 , St.Side.BOTTOM);
    }

    _onKeyPress() {
        return Clutter.EVENT_PROPAGATE;
    }

    open(animate) {
        super.open(animate);
        this.sourceActor.add_style_pseudo_class('active');
    }

    close(animate) {
        super.close(animate);
        this.sourceActor.remove_style_pseudo_class('active');
        this.sourceActor.sync_hover();
    }
};


var MenuButtonSecondaryMenu = class extends PopupMenu.PopupMenu {

    constructor(source) {
        super(source, 0.5, St.Side.TOP);


        this.actor.add_style_class_name('panel-menu app-menu');
        Main.uiGroup.add_child(this.actor);
        this.actor.hide();

        this._appendItem({
            title: _('System Monitor'),
            cmd: ['gnome-system-monitor']
        });

        this._appendItem({
            title: _('Files'),
            cmd: ['nautilus']
        });

        this._appendItem({
            title: _('Settings'),
            cmd: ['gnome-control-center']
        });

        this._appendItem({
            title: _('Zorin Appearance'),
            cmd: ['zorin-appearance']
        });

        this._appendSeparator();

        this._appendItem({
            title: _('Edit Menu'),
            cmd: ['alacarte']
        });

        this._appendItem({
            title: _('Search Settings'),
            cmd: ['gnome-control-center', 'search']
        });
    }

    // Only add menu entries for commands that exist in path
    _appendItem(info) {
        if (Utils.checkIfCommandExists(info.cmd[0])) {
            let item = this._appendMenuItem(_(info.title));

            item.connect('activate', function() {
                print("activated: " + info.title);
                Util.spawn(info.cmd);
            });
            return item;
        }

        return null;
    }

    _appendSeparator() {
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.addMenuItem(separator);
    }

    _appendMenuItem(labelText) {
        let item = new PopupMenu.PopupMenuItem(labelText);
        this.addMenuItem(item);
        return item;
    }

    updateArrowSide(side) {
        this._arrowSide = side;
        this._boxPointer._arrowSide = side;
        this._boxPointer._userArrowSide = side;
        this._boxPointer.setSourceAlignment(0.5);
        this._arrowAlignment = 0.5;
        this._boxPointer._border.queue_repaint();
    }
};
