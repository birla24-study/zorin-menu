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
 */

// Import Libraries
const {Atk, Clutter, GLib, GObject, Meta, St} = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionState = ExtensionUtils.ExtensionState;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widgets = Me.imports.widgets;
const Layouts = Me.imports.layouts;
const AppsBackend = Me.imports.appsbackend;
const Keybinder = Me.imports.keybinder;
const SecondaryMenu = Me.imports.secondaryMenu;
const Constants = Me.imports.constants;
const Utils = Me.imports.utils;
const {PopupAnimation} = imports.ui.boxpointer;

// Application menu class
var ApplicationsMenu = class ApplicationsMenu extends PopupMenu.PopupMenu {
    // Initialize the menu
    constructor(sourceActor, settings) {
        super(sourceActor, 0.5, St.Side.TOP);
        this._intellihideTimeoutId = 0;
        this._section = new PopupMenu.PopupMenuSection();
        this.addMenuItem(this._section);
        this._settings = settings;
        this._appsBackend = new AppsBackend.AppsBackend();

        this._settingsId = this._settings.connect('changed::layout', () => {
            this._reloadLayout();
        });
        this.actor.connect('destroy', this._onDestroy.bind(this));
        this.actor.add_style_class_name('panel-menu');
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
    }

    _loadLayout() {
        this._layout = Layouts.getLayout(this._settings, this._appsBackend);
        this._section.actor.add_child(this._layout);
        this._layout.connect('activated', () => {
            this._onLayoutActivated();
        });
        this._layout.connect('screenshot-activated', () => {
            this._onScreenshotActivated();
        });
    }

    _reloadLayout() {
        this._layout?.destroy();
        this._loadLayout();
    }

    _togglePanelIntellihide() {
        let panel = Main.panel.get_parent();
        if (panel && panel.intellihide && panel.intellihide.enabled && !panel.intellihide._panelBox.visible) {
            panel.intellihide._revealPanel(true);
        }
    }

    _panelIntellihideQueueUpdatePosition() {
        let panel = Main.panel.get_parent();
        if (panel && panel.intellihide && panel.intellihide.enabled && panel.intellihide._panelBox.visible) {
            panel.intellihide._queueUpdatePanelPosition();
        }
    }

    // Return that the menu is not empty (used by parent class)
    isEmpty() {
        return false;
    }

    // Handle opening the menu
    open(animate) {
        this._togglePanelIntellihide();
        super.open(animate);
        if (!this._layout) {
            this._loadLayout();
        }
        this._layout.reset();
        this._layout.updateHeight();
    }

    // Handle menu item activation
    _onLayoutActivated() {
        this.close(PopupAnimation.FULL);
        if (Main.overview.visible)
            Main.overview.hide();
    }

    // Handle screenshot item activation
    _onScreenshotActivated() {
        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
            Main.screenshotUI.open().catch(logError);
            return GLib.SOURCE_REMOVE;
        });
        this.close(PopupAnimation.NONE);
    }

    // Handle closing the menu
    close(animate) {
        super.close(animate);
        if (this._intellihideTimeoutId > 0) {
            GLib.source_remove(this._intellihideTimeoutId);
            this._intellihideTimeoutId = 0;
        }
        this._intellihideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.INTELLIHIDE_TIMEOUT, () => {
            this._intellihideTimeoutId = 0;
            this._panelIntellihideQueueUpdatePosition();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Toggle menu open state
    toggle() {
        super.toggle();
    }

    updateArrowSide(side) {
        this._arrowSide = side;
        this._boxPointer._arrowSide = side;
        this._boxPointer._userArrowSide = side;
        this._boxPointer.setSourceAlignment(0.5);
        this._arrowAlignment = 0.5;
        this._boxPointer._border.queue_repaint();
    }

    _onDestroy() {
        this._appsBackend.destroy();
        this._settings.disconnect(this._settingsId);
    }
};

// Application Menu Button class
var ApplicationsButton = GObject.registerClass(
class ApplicationsButton extends PanelMenu.Button {
    // Initialize the menu
    _init(settings) {
        super._init(1.0, null, true);

        this._settings = settings
        
        this._menu = new ApplicationsMenu(this, this._settings);
        this._menu.connect('open-state-changed', this._onOpenStateChanged.bind(this));

        this._secondaryMenu = new SecondaryMenu.MenuButtonSecondaryMenu(this);
        this._secondaryMenu.connect('open-state-changed', this._onOpenStateChanged.bind(this));

        this.menuManager = new PopupMenu.PopupMenuManager(Main.panel);
        this.menuManager._changeMenu = (menu) => {};
        this.menuManager.addMenu(this._menu);
        this.menuManager.addMenu(this._secondaryMenu);

        this.accessible_role = Atk.Role.LABEL;
        this._menuButton = new Widgets.MenuButton(this._settings);
        this.add_child(this._menuButton);
        this.name = 'panelApplications';
        this._showingId = Main.overview.connect('showing', () => {
            this.add_accessible_state(Atk.StateType.CHECKED);
        });
        this._hidingId = Main.overview.connect('hiding', () => {
            this.remove_accessible_state(Atk.StateType.CHECKED);
        });
        this._menuKeybinder = new Keybinder.MenuKeybinder( () => {
            this._menu.toggle();
        });
        this._settings.connect('changed::super-hotkey', this._updateKeybinding.bind(this));
        this._updateKeybinding();

        this._syncArrowSide();
        this._mappedID = this.connect('notify::mapped', () => this._syncArrowSide());
        this._extensionChangedId = Main.extensionManager.connect('extension-state-changed', (data, extension) => {
            if (extension.uuid === Constants.ZORIN_PANEL_UUID || extension.uuid === Constants.DASH_TO_PANEL_UUID) {
                this._syncArrowSide();
            }
        });
    }

    _syncArrowSide() {
        if (!this.get_parent() || !this.mapped) {
            return;
        } else if (this._mappedID) {
            this.disconnect(this._mappedID);
            delete this._mappedID;
        }

        let side = St.Side.TOP;
        
        const monitorIndex = Main.layoutManager.findIndexForActor(this);

        this._zorinPanel = Main.extensionManager.lookup(Constants.ZORIN_PANEL_UUID);
        this._dashToPanel = Main.extensionManager.lookup(Constants.DASH_TO_PANEL_UUID);

        if (this._zorinPanel?.state === ExtensionState.ENABLED && global.zorinTaskbar) {
            // Disconnect from conflicting panel extension
            if (this._dtpPostionChangedID && this._dashToPanel?.settings) {
                this._dashToPanel.settings.disconnect(this._dtpPostionChangedID);
                this._dtpPostionChangedID = null;
            }

            // Connect to Zorin panel extension
            if (!this._zorinPanelPostionChangedID) {
                this._zorinPanelPostionChangedID = this._zorinPanel.settings.connect('changed::panel-positions', () => {
                    const newMonitorIndex = Main.layoutManager.findIndexForActor(this);
                    const newSide = Utils.getSettingPanelPosition(this._zorinPanel.settings, newMonitorIndex);
                    this._setMenuArrowSides(newSide);
                });
            }

            side = Utils.getSettingPanelPosition(this._zorinPanel.settings, monitorIndex);
        } else if (this._dashToPanel?.state === ExtensionState.ENABLED && global.dashToPanel) {
            // Disconnect from conflicting panel extension
            if (this._zorinPanelPostionChangedID && this._zorinPanel?.settings) {
                this._zorinPanel.settings.disconnect(this._zorinPanelPostionChangedID);
                this._zorinPanelPostionChangedID = null;
            }

            // Connect to DashToPanel
            if (!this._dtpPostionChangedID) {
                this._dtpPostionChangedID = this._dashToPanel.settings.connect('changed::panel-positions', () => {
                    const newMonitorIndex = Main.layoutManager.findIndexForActor(this);
                    const newSide = Utils.getSettingPanelPosition(this._dashToPanel.settings, newMonitorIndex);
                    this._setMenuArrowSides(newSide);
                });
            }

            side = Utils.getSettingPanelPosition(this._dashToPanel.settings, monitorIndex);
        } else {
            // Disconnect from panel extensions
            if (this._zorinPanelPostionChangedID && this._zorinPanel?.settings) {
                this._zorinPanel.settings.disconnect(this._zorinPanelPostionChangedID);
                this._zorinPanelPostionChangedID = null;
            }
            if (this._dtpPostionChangedID && this._dashToPanel?.settings) {
                this._dashToPanel.settings.disconnect(this._dtpPostionChangedID);
                this._dtpPostionChangedID = null;
            }
        }
        this._setMenuArrowSides(side);
    }

    _setMenuArrowSides(side) {
        this._menu.updateArrowSide(side);
        this._secondaryMenu.updateArrowSide(side);
    }

    // Destroy the menu button
    _onDestroy() {
        if (this._menu) {
            this._menu.destroy();
            this._menu = null;
        }
        if (this._secondaryMenu) {
            this._secondaryMenu.destroy();
            this._secondaryMenu = null;
        }
        if (this._menuButton) {
            this._menuButton.destroy();
            this._menuButton = null;
        }
        super._onDestroy();
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
            this._showingId = null;
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
            this._hidingId = null;
        }
        if(this._extensionChangedId){
            Main.extensionManager.disconnect(this._extensionChangedId);
            this._extensionChangedId = null;
        }
        if (this._zorinPanelPostionChangedID && this._zorinPanel?.settings) {
            this._zorinPanel.settings.disconnect(this._zorinPanelPostionChangedID);
            this._zorinPanelPostionChangedID = null;
        }
        if (this._dtpPostionChangedID && this._dashToPanel?.settings) {
            this._dashToPanel.settings.disconnect(this._dtpPostionChangedID);
            this._dtpPostionChangedID = null;
        }
        this._menuKeybinder.destroy();
    }

    _updateKeybinding() {
        let enableHotkey = this._settings.get_boolean('super-hotkey');
        if (enableHotkey) {
            this._menuKeybinder.enableHotKey();
        } else {
            this._menuKeybinder.disableHotKey();
        }
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() === Clutter.BUTTON_PRIMARY || event.get_button() === Clutter.BUTTON_MIDDLE)
                this._menu.toggle();
            else if (event.get_button() === Clutter.BUTTON_SECONDARY)
                this._secondaryMenu.toggle();
        } else if (event.type() === Clutter.EventType.TOUCH_BEGIN) {
            this._menu.toggle();
        }
        return Clutter.EVENT_PROPAGATE;
    }


    vfunc_hide() {
        super.vfunc_hide();

        if (this._menu)
            this._menu.close();
    }

    _updateMenuMaxHeight() {
        // Setting the max-height won't do any good if the minimum height of the
        // menu is higher then the screen; it's useful if part of the menu is
        // scrollable so the minimum height is smaller than the natural height
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let verticalMargins = this._menu.actor.margin_top + this._menu.actor.margin_bottom;

        // The workarea and margin dimensions are in physical pixels, but CSS
        // measures are in logical pixels, so make sure to consider the scale
        // factor when computing max-height
        let maxHeight = Math.round((workArea.height - verticalMargins) / scaleFactor);
        this._menu.actor.style = 'max-height: %spx;'.format(maxHeight);
    }


    _onOpenStateChanged(menu, open) {
        if (open) {
            this.add_style_pseudo_class('active');
            if (Main.panel.menuManager && Main.panel.menuManager.activeMenu)
                Main.panel.menuManager.activeMenu.toggle();

            if (this._menu.isOpen)
                this._updateMenuMaxHeight();
        } else if (!this._menu.isOpen && !this._secondaryMenu.isOpen) {
            this.remove_style_pseudo_class('active');
        }
    }
});
