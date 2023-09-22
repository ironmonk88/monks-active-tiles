import { MonksActiveTiles, log, error, setting, i18n, makeid } from '../monks-active-tiles.js';
import { TemplateConfig } from '../apps/template-config.js';

export class TileTemplates extends DocumentDirectory {
    constructor(options = {}) {
        super(options);
        this._original = {};

        const sortingModes = game.settings.get("core", "collectionSortingModes");
        this.sortingMode = sortingModes["Tiles"] || "m";

        this.folders = setting("tile-template-folders") || [];

        // Fix any folders that have no ids
        let checkFolders = this.folders.filter(f => {
            if (f.folder == "") f.folder = null;
            if (!this.folders.find(t => t._id == f.folder)) f.folder = null;
            return f._id;
        });
        if (checkFolders.length != this.folders.length)
            game.settings.set("monks-active-tiles", "tile-template-folders", checkFolders);
    }

    static get defaultOptions() {
        return {
            id: "tile-template",
            classes: ["tab", "sidebar-tab", "tile-templates"],
            baseApplication: "SidebarTab",
            title: "MonksActiveTiles.TileTemplates",
            template: "templates/sidebar/document-directory.html",
            renderUpdateKeys: ["name", "img", "thumb", "ownership", "sort", "sorting", "folder"],
            scrollY: ["ol.directory-list"],
            dragDrop: [{ dragSelector: ".directory-item", dropSelector: ".directory-list" }],
            filters: [{ inputSelector: 'input[name="search"]', contentSelector: ".directory-list" }],
            contextMenuSelector: ".directory-item.document",
            entryClickSelector: ".entry-name",
            tabs: [],
            popOut: true,
            width: 300,
            height: "auto",
        };
    }

    static get documentName() {
        return "Tile";
    }

    static get collection() {
        let data = setting("tile-templates") || [];
        data.documentName = TileDocument.documentName;
        data.documentClass = {
            metadata: {
                label: "Tiles"
            },
            deleteDocuments: async (ids) => {
                let templates = duplicate(setting("tile-templates") || []);
                for (let id of ids)
                    templates.findSplice(t => t._id == id);
                await game.settings.set("monks-active-tiles", "tile-templates", templates);
                new TileTemplates().render(true);
            },
            createDocuments: async (items) => {
                let templates = duplicate(setting("tile-templates") || []);
                for (let data of items) {
                    let _data = duplicate(data);
                    let doc = new TileDocument(_data);
                    let template = doc.toObject();
                    template._id = template.id = randomID();
                    template.name = data.name;
                    template.visible = true;
                    template.folder = data.folder;
                    delete template.img;
                    template.img = template.texture.src;
                    template.thumbnail = template.img || "modules/monks-active-tiles/img/cube.svg";
                    if (VideoHelper.hasVideoExtension(template.thumbnail)) {
                        const t = await ImageHelper.createThumbnail(template.thumbnail, { width: 60, height: 60 });
                        template.thumbnail = t.thumb;
                    }

                    templates.push(template);
                }
                await game.settings.set("monks-active-tiles", "tile-templates", templates);
                new TileTemplates().render(true);
            }
        }
        data.get = (id) => {
            let tile = data.find(t => t._id === id);
            if (!tile) return null;
            tile.canUserModify = () => { return true; };
            tile.toObject = () => { return duplicate(tile); };
            tile.toCompendium = () => {
                let data = deepClone(tile);
                delete data._id;
                delete data.folder;
                delete data.sort;
                delete data.ownership;
                return data;
            };
            tile.isOwner = true;
            if (!tile.uuid) {
                Object.defineProperty(tile, 'uuid', {
                    get: function () {
                        return `Tile.${tile._id}`;
                    }
                });
            }
            return tile;
        }
        data.folders = this.folders;
        data.toggleSortingMode = () => {
            this.sortingMode = this.sortingMode === "a" ? "m" : "a";
            const sortingModes = game.settings.get("core", "collectionSortingModes");
            sortingModes["Tiles"] = this.sortingMode;
            game.settings.set("core", "collectionSortingModes", sortingModes);
        };
        data.toggleSearchMode = () => {
        }
        return data;
    }

    get collection() {
        return this.constructor.collection;
    }

    static get folders() {
        return setting("tile-template-folders") || [];
    }

    get maxFolderDepth() {
        return CONST.FOLDER_MAX_DEPTH;
    }

    initialize() {
        this.folders = setting("tile-template-folders") || [];

        // Assign Folders
        for (let folder of this.folders) {
            if (folder.uuid === undefined) {
                Object.defineProperty(folder, 'uuid', {
                    get: function () { return `Folder.${this.id}`; }
                });
            }
            if (folder.expanded === undefined) {
                Object.defineProperty(folder, 'expanded', {
                    get: function () { return game.folders._expanded[this.uuid] || false; }
                });
            }
        }

        // Assign Documents
        this.documents = this.collection;

        // Build Tree
        this.tree = this.buildTree(this.folders, this.documents);
    }

    buildTree(folders, entries) {
        const handled = new Set();
        const createNode = (root, folder, depth) => {
            return { root, folder, depth, visible: false, children: [], entries: [] };
        };

        // Create the tree structure
        const tree = createNode(true, null, 0);
        const depths = [[tree]];

        // Iterate by folder depth, populating content
        for (let depth = 1; depth <= this.maxFolderDepth + 1; depth++) {
            const allowChildren = depth <= this.maxFolderDepth;
            depths[depth] = [];
            const nodes = depths[depth - 1];
            if (!nodes.length) break;
            for (const node of nodes) {
                const folder = node.folder;
                if (!node.root) { // Ensure we don't encounter any infinite loop
                    if (handled.has(folder.id)) continue;
                    handled.add(folder.id);
                }

                // Classify content for this folder
                const classified = this._classifyFolderContent(folder, folders, entries, { allowChildren });
                node.entries = classified.entries;
                node.children = classified.folders.map(folder => createNode(false, folder, depth));
                depths[depth].push(...node.children);

                // Update unassigned content
                folders = classified.unassignedFolders;
                entries = classified.unassignedEntries;
            }
        }

        // Populate left-over folders at the root level of the tree
        for (const folder of folders) {
            const node = createNode(false, folder, 1);
            const classified = this._classifyFolderContent(folder, folders, entries, { allowChildren: false });
            node.entries = classified.entries;
            entries = classified.unassignedEntries;
            depths[1].push(node);
        }

        // Populate left-over entries at the root level of the tree
        if (entries.length) {
            tree.entries.push(...entries);
        }

        // Sort the top level entries and folders
        const sort = this.sortingMode === "a" ? this.constructor._sortAlphabetical : this.constructor._sortStandard;
        tree.entries.sort(sort);
        tree.children.sort((a, b) => sort(a.folder, b.folder));

        // Recursively filter visibility of the tree
        const filterChildren = node => {
            node.children = node.children.filter(child => {
                filterChildren(child);
                return child.visible;
            });
            node.visible = node.root || game.user.isGM || ((node.children.length + node.entries.length) > 0);

            // Populate some attributes of the Folder document
            if (node.folder) {
                node.folder.displayed = node.visible;
                node.folder.depth = node.depth;
                node.folder.children = node.children;
            }
        };
        filterChildren(tree);
        return tree;
    }

    //  Need to override this as we don't use proper folders so it won't find them properly
    _classifyFolderContent(folder, folders, entries, { allowChildren = true } = {}) {
        const sort = folder?.sorting === "a" ? this.constructor._sortAlphabetical : this.constructor._sortStandard;

        // Determine whether an entry belongs to a folder, via folder ID or folder reference
        function folderMatches(entry) {
            if (entry.folder?._id) return entry.folder._id === folder?._id;
            return (entry.folder === folder) || (entry.folder === folder?._id);
        }

        // Partition folders into children and unassigned folders
        const [unassignedFolders, subfolders] = folders.partition(f => allowChildren && folderMatches(f));
        subfolders.sort(sort);

        // Partition entries into folder contents and unassigned entries
        const [unassignedEntries, contents] = entries.partition(e => folderMatches(e));
        contents.sort(sort);

        // Return the classified content
        return { folders: subfolders, entries: contents, unassignedFolders, unassignedEntries };
    }

    static _sortAlphabetical(a, b) {
        if (a.name === undefined) throw new Error(`Missing name property for ${a.constructor.name} ${a.id}`);
        if (b.name === undefined) throw new Error(`Missing name property for ${b.constructor.name} ${b.id}`);
        return a.name.localeCompare(b.name);
    }

    static _sortStandard(a, b) {
        return (a.sort || 0) - (b.sort || 0);
    }

    async getData(options) {
        const context = {
            cssId: this.id,
            cssClass: this.options.classes.join(" "),
            tabName: this.tabName,
            user: game.user
        }
        const cfg = CONFIG["Tile"];
        const cls = cfg.documentClass;
        return foundry.utils.mergeObject(context, {
            canCreateEntry: true,
            canCreateFolder: true,
            tree: this.tree,
            documentCls: cls.documentName.toLowerCase(),
            tabName: cls.metadata.collection,
            sidebarIcon: "fa-solid fa-cube",
            folderIcon: CONFIG.Folder.sidebarIcon,
            label: game.i18n.localize(cls.metadata.label),
            labelPlural: game.i18n.localize(cls.metadata.labelPlural),
            entryPartial: this.constructor.entryPartial,
            folderPartial: this.constructor.folderPartial,
            searchIcon: "fa-search",
            searchTooltip: "SIDEBAR.SearchModeName",
            sortIcon: this.sortingMode === "a" ? "fa-arrow-down-a-z" : "fa-arrow-down-short-wide",
            sortTooltip: this.sortingMode === "a" ? "SIDEBAR.SortModeAlpha" : "SIDEBAR.SortModeManual",
        });
    }

    /*
    async _render(...args) {
        await super._render(...args);
        $('.header-actions.action-buttons', this.element).hide();
        this.setPosition({ height: 'auto' });
    }
    */

    /*_toggleFolder(event) {
        super._toggleFolder(event);
        let folder = $(event.currentTarget.parentElement);
    }*/

    async updateTile(data) {
        let templates = duplicate(this.collection);

        if (!data.id)
            return;

        let template = templates.find(t => t._id == data.id);
        if (!template)
            return;

        mergeObject(template, data);

        await game.settings.set("monks-active-tiles", "tile-templates", templates);
        this.render(true);
    }

    _onClickEntryName(event) {
        let li = event.currentTarget.closest("li");
        let templates = this.collection;
        const document = templates.find(t => t._id == li.dataset.documentId);

        new TemplateConfig(document, this).render(true);
    }

    async _onCreateEntry(event) {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        const data = { folder: button.dataset.folder };
        const options = { width: 320, left: window.innerWidth - 630, top: button.offsetTop };
        return TileTemplates.createDialog(data, options).then(() => {
            this.render(true);
        });
    }

    static async createDialog(data = {}, { parent = null, pack = null, ...options } = {}) {
        // Collect data
        const documentName = TileDocument.documentName;
        const folders = parent ? [] : this.folders;
        const title = (data.id ? game.i18n.format("DOCUMENT.Update", { type: documentName }) : game.i18n.format("DOCUMENT.Create", { type: documentName }));

        // Render the document creation form
        const html = await renderTemplate("templates/sidebar/document-create.html", {
            folders,
            name: data.name || game.i18n.format("DOCUMENT.New", { type: documentName }),
            folder: data.folder,
            hasFolders: folders.length >= 1,
            hasTypes: false
        });

        // Render the confirmation dialog window
        return await Dialog.prompt({
            title: title,
            content: html,
            label: title,
            callback: async (html) => {
                const form = html[0].querySelector("form");
                const fd = new FormDataExtended(form);
                foundry.utils.mergeObject(data, fd.object, { inplace: true });
                if (!data.folder) delete data.folder;

                let templates = duplicate(this.collection);

                if (data.id) {
                    templates.findSplice(t => t._id == data.id, data);
                } else {
                    data.width = canvas.grid.size;
                    data.height = canvas.grid.size;
                    let _data = duplicate(data);
                    let doc = new TileDocument(_data);
                    let template = doc.toObject();
                    template._id = template.id = data.id || randomID();
                    template.name = data.name;
                    template.visible = true;
                    template.folder = data.folder;
                    delete template.img;
                    template.img = template.texture.src;
                    template.thumbnail = template.img || "modules/monks-active-tiles/img/cube.svg";
                    if (VideoHelper.hasVideoExtension(template.thumbnail)) {
                        const t = await ImageHelper.createThumbnail(template.thumbnail, { width: 60, height: 60 });
                        template.thumbnail = t.thumb;
                    }

                    templates.push(template);
                }

                await game.settings.set("monks-active-tiles", "tile-templates", templates);
            },
            rejectClose: false,
            options
        });
    }

    _onCreateFolder(event) {
        event.stopPropagation();
        event.preventDefault();
        let folder = {
            testUserPermission: () => { return game.user.isGM },
            flags: {},
            apps: {},
            isOwner: game.user.isGM,
            sorting: "m"
        };
        folder.toObject = () => { return folder; };
        folder.getFlag = () => { return null; };
        const button = event.currentTarget;
        const li = button.closest(".directory-item");
        folder.folder = li?.dataset?.folderId || null;
        const options = { top: button.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width, editable: true };
        let fc = new FolderConfig(folder, options).render(true, { editable: true });
        fc._updateObject = async (event, formData) => {
            if (!formData.name?.trim()) formData.name = Folder.implementation.defaultName();
            let folders = this.folders;
            formData._id = randomID();
            formData.id = formData._id;
            formData.visible = true;
            formData.folder = formData.folder == "" ? null : formData.folder;
            folders.push(formData);
            game.settings.set("monks-active-tiles", "tile-template-folders", folders);
            this.render(true);
        }
    }

    _onSearchFilter(event, query, rgx, html) {
        const isSearch = !!query;
        const documentIds = new Set();
        const folderIds = new Set();
        const autoExpandFolderIds = new Set();

        const folders = this.folders;

        // Match documents and folders
        if (isSearch) {

            // Include folders and their parents
            function includeFolder(folderId, autoExpand = true) {
                if (!folderId) return;
                if (folderIds.has(folderId)) return;
                folderIds.add(folderId);
                if (autoExpand) autoExpandFolderIds.add(folderId);
                let folder = folders.find(f => f._id == folderId);
                if (folder) includeFolder(folder); // Always autoexpand parent folders
            }

            // Match documents by name
            for (let d of this.documents) {
                if (rgx.test(SearchFilter.cleanQuery(d.name))) {
                    documentIds.add(d.id);
                    includeFolder(d.folder);
                }
            }

            // Match folders by name
            for (let f of this.folders) {
                if (rgx.test(SearchFilter.cleanQuery(f.name))) {
                    includeFolder(f, false);
                    for (let d of this.documents.filter(x => x.folder === f)) {
                        documentIds.add(d.id);
                    }
                }
            }
        }

        // Toggle each directory item
        for (let el of html.querySelectorAll(".directory-item")) {

            // Documents
            if (el.classList.contains("document")) {
                el.style.display = (!isSearch || documentIds.has(el.dataset.documentId)) ? "flex" : "none";
            }

            // Folders
            if (el.classList.contains("folder")) {
                let match = isSearch && folderIds.has(el.dataset.folderId);
                el.style.display = (!isSearch || match) ? "flex" : "none";

                if (autoExpandFolderIds.has(el.dataset.folderId)) {
                    if (isSearch && match) el.classList.remove("collapsed");
                    else el.classList.toggle("collapsed", !game.folders._expanded[el.dataset.folderId]);
                }
            }
        }
    }

    _onDragStart(event) {
        if (ui.context) ui.context.close({ animate: false });
        const li = event.currentTarget.closest(".directory-item");
        const documentName = this.constructor.documentName;
        const isFolder = li.classList.contains("folder");
        const doc = isFolder
            ? this.folders.find(f => f._id == li.dataset.folderId)
            : this.collection.find(t => t._id == li.dataset.documentId);

        if (!doc)
            return;

        delete doc.x;
        delete doc.y;
        const dragData = { type: isFolder ? "Folder" : "Tile", data: doc };
        if (isFolder) foundry.utils.mergeObject(dragData, { documentName });
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    async _handleDroppedEntry(target, data) {

        // Determine the closest Folder
        const closestFolder = target ? target.closest(".folder") : null;
        if (closestFolder) closestFolder.classList.remove("droptarget");
        let folder = closestFolder ? this.folders.find(f => f._id == closestFolder.dataset.folderId)?._id : null;

        // Obtain the dropped Document
        const collection = duplicate(this.collection);
        let document = data.data;
        if (!document) document = this.collection.get(data.uuid.replace("Tile.", "")); // Should technically be fromUuid
        if (!document) return;

        // Sort relative to another Document
        const sortData = { sortKey: "sort" };
        const isRelative = target && target.dataset.documentId;
        if (isRelative) {
            if (document._id === target.dataset.documentId) return; // Don't drop on yourself
            const targetDocument = collection.find(d => d._id == target.dataset.documentId);
            sortData.target = targetDocument;
            folder = targetDocument.folder;
        }

        // Sort within to the closest Folder
        else sortData.target = null;

        // Determine siblings and perform sort
        sortData.siblings = collection.filter(doc => (doc._id !== document._id) && (doc.folder === folder));
        sortData.updateData = { folder: folder || null };

        let { updateData = {}, ...sortOptions } = sortData;

        const sorting = SortingHelpers.performIntegerSort(document, sortOptions);
        for (let s of sorting) {
            let doc = collection.find(d => d._id == s.target.id);
            foundry.utils.mergeObject(doc, s.update);
            doc.folder = folder || null;
        }

        await game.settings.set("monks-active-tiles", "tile-templates", collection);

        this.render(true);

        return document;
    }

    async _handleDroppedFolder(target, data) {
        if (data.documentName !== this.constructor.documentName) return;
        const folder = data.data;

        let folders = duplicate(this.folders);

        // Determine the closest folder ID
        const closestFolder = target ? target.closest(".folder") : null;
        if (closestFolder) closestFolder.classList.remove("droptarget");
        const closestFolderId = closestFolder ? closestFolder.dataset.folderId : null;

        // Sort into another Folder
        const sortData = { sortKey: "sort", sortBefore: true };
        const isFolder = target && target.dataset.folderId;
        if (isFolder) {
            const targetFolder = folders.find(f => f.id == target.dataset.folderId);

            // Sort relative to a collapsed Folder
            if (target.classList.contains("collapsed")) {
                sortData.target = targetFolder;
                sortData.parentId = targetFolder.folder?._id;
            }

            // Drop into an expanded Folder
            else {
                if (Number(target.dataset.folderDepth) >= CONST.FOLDER_MAX_DEPTH) return; // Prevent going beyond max depth
                sortData.target = null;
                sortData.parentId = targetFolder._id;
            }
        }

        // Sort relative to existing Folder contents
        else {
            sortData.parentId = closestFolderId;
            sortData.target = closestFolder && closestFolder.classList.contains("collapsed") ? closestFolder : null;
        }

        // Prevent assigning a folder as its own parent
        if (sortData.parentId === folder._id) return;

        // Determine siblings and perform sort
        
        sortData.siblings = folders.filter(f => {
            return (f.folder === sortData.parentId || (f.folder == undefined && sortData.parentId == undefined)) && (f.id !== folder._id);
        });
        sortData.updateData = { folder: sortData.parentId };

        let { updateData = {}, ...sortOptions } = sortData;

        const sorting = SortingHelpers.performIntegerSort(folder, sortOptions);
        for (let s of sorting) {
            let fold = folders.find(f => f._id == s.target.id);
            foundry.utils.mergeObject(fold, s.update);
            fold.folder = sortData.parentId || null;
        }

        await game.settings.set("monks-active-tiles", "tile-template-folders", folders);

        this.render(true);
    }

    getSubfolders(folders, folder, recursive = false) {
        let subfolders = folders.filter(f => f.folder === folder.id);
        if (recursive && subfolders.length) {
            for (let f of subfolders) {
                const children = this.getSubfolders(folders, f, true);
                subfolders = subfolders.concat(children);
            }
        }
        return subfolders;
    }

    async deleteFolder(folders, folder, options, userId) {
        const templates = duplicate(this.collection || []);
        const parentFolder = folder.folder;
        const { deleteSubfolders, deleteContents } = options;

        // Delete or move sub-Folders
        const deleteFolderIds = [];
        for (let f of this.getSubfolders(folders, folder)) {
            if (deleteSubfolders) deleteFolderIds.push(f.id);
            else f.folder = parentFolder;
        }
        if (deleteFolderIds.length) {
            for (let id of deleteFolderIds)
                folders.findSplice(f => f._id == id);
        }

        // Delete or move contained Documents
        const deleteDocumentIds = [];
        for (let d of templates) {
            if (d.folder !== folder._id) continue;
            if (deleteContents) deleteDocumentIds.push(d._id);
            else d.folder = parentFolder;
        }
        if (deleteDocumentIds.length) {
            for (let id of deleteDocumentIds)
                templates.findSplice(t => t._id == id);
        }
        await game.settings.set("monks-active-tiles", "tile-templates", templates);
    }

    _getFolderContextOptions() {
        return [
            {
                name: "FOLDER.Edit",
                icon: '<i class="fas fa-edit"></i>',
                condition: game.user.isGM,
                callback: header => {
                    const li = header.parent()[0];
                    const folders = duplicate(this.folders);
                    let folder = folders.find(t => t._id == li.dataset.folderId);
                    const options = { top: li.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width };
                    let fld = new Folder(mergeObject(folder, { type: "JournalEntry" }, { inplace: false }));
                    let config = new FolderConfig(fld, options).render(true);
                    config._updateObject = async (event, formData) => {
                        if (!formData.name?.trim()) formData.name = Folder.implementation.defaultName();
                        delete formData.type;
                        if (formData.folder == "") formData.folder = null;
                        folder = mergeObject(folder, formData);
                        await game.settings.set("monks-active-tiles", "tile-template-folders", folders);
                        this.render();
                    }
                }
            },
            {
                name: "FOLDER.Remove",
                icon: '<i class="fas fa-trash"></i>',
                condition: game.user.isGM,
                callback: header => {
                    const li = header.parent()[0];
                    const folders = duplicate(this.folders);
                    const folder = folders.find(t => t._id == li.dataset.folderId);
                    return Dialog.confirm({
                        title: `${game.i18n.localize("FOLDER.Remove")} ${folder.name}`,
                        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.RemoveWarning")}</p>`,
                        yes: async () => {
                            await this.deleteFolder(folders, folder, { deleteSubfolders: false, deleteContents: false });
                            folders.findSplice(t => t._id == folder._id);
                            await game.settings.set("monks-active-tiles", "tile-template-folders", folders);
                            this.render();
                        },
                        options: {
                            top: Math.min(li.offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720,
                            width: 400
                        }
                    });
                }
            },
            {
                name: "FOLDER.Delete",
                icon: '<i class="fas fa-dumpster"></i>',
                condition: game.user.isGM,
                callback: header => {
                    const li = header.parent()[0];
                    const folders = duplicate(this.folders);
                    const folder = folders.find(t => t._id == li.dataset.folderId);
                    return Dialog.confirm({
                        title: `${game.i18n.localize("FOLDER.Delete")} ${folder.name}`,
                        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.DeleteWarning")}</p>`,
                        yes: async () => {
                            await this.deleteFolder(folders, folder, { deleteSubfolders: true, deleteContents: true })
                            folders.findSplice(t => t._id == folder._id);
                            await game.settings.set("monks-active-tiles", "tile-template-folders", folders);
                            this.render();
                        },
                        options: {
                            top: Math.min(li.offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720,
                            width: 400
                        }
                    });
                }
            }
        ];
    }

   _getEntryContextOptions() {
        return [
            {
                name: "FOLDER.Clear",
                icon: '<i class="fas fa-folder"></i>',
                condition: li => {
                    const document = this.collection.find(t => t._id == li.data("documentId"));
                    return game.user.isGM && !!document?.folder;
                },
                callback: li => {
                    const templates = duplicate(this.collection);
                    const document = templates.find(t => t._id == li.data("documentId"));
                    document.folder = null;
                    game.settings.set("monks-active-tiles", "tile-templates", templates);
                }
            },
            {
                name: "SIDEBAR.Delete",
                icon: '<i class="fas fa-trash"></i>',
                condition: () => game.user.isGM,
                callback: li => {
                    const templates = duplicate(this.collection);
                    const id = li.data("documentId");
                    const document = templates.find(t => t._id == id || (t._id == undefined && id == ""));
                    if (!document) return;
                    return Dialog.confirm({
                        title: `${game.i18n.format("DOCUMENT.Delete", { type: "Tile Template" })}: ${document.name}`,
                        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.format("SIDEBAR.DeleteWarning", { type: "Tile Template" })}</p>`,
                        yes: async () => {
                            templates.findSplice(t => t._id == id || (t._id == undefined && id == ""));
                            await game.settings.set("monks-active-tiles", "tile-templates", templates);
                            new TileTemplates().render(true);
                        },
                        options: {
                            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720
                        }
                    });
                }
            },
            {
                name: "SIDEBAR.Export",
                icon: '<i class="fas fa-file-export"></i>',
                condition: li => game.user.isGM,
                callback: li => {
                    const templates = this.collection;
                    const document = templates.find(t => t._id == li.data("documentId"));
                    if (!document) return;
                    const data = deepClone(document);
                    delete data._id;
                    delete data.folder;
                    delete data.sort;
                    delete data.ownership;
                    data.flags["exportSource"] = {
                        world: game.world.id,
                        system: game.system.id,
                        coreVersion: game.version,
                        systemVersion: game.system.version
                    };
                    const filename = `fvtt-tiledata-${document.name.slugify()}.json`;
                    saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
                }
            },
            {
                name: "SIDEBAR.Import",
                icon: '<i class="fas fa-file-import"></i>',
                condition: li => game.user.isGM,
                callback: async (li) => {
                    const templates = duplicate(this.collection);
                    const replaceId = li.data("documentId");
                    const document = templates.find(t => t._id == replaceId);
                    if (!document) return;
                    new Dialog({
                        title: `Import Data: ${document.name}`,
                        content: await renderTemplate("templates/apps/import-data.html", {
                            hint1: game.i18n.format("DOCUMENT.ImportDataHint1", { document: TileDocument.documentName }),
                            hint2: game.i18n.format("DOCUMENT.ImportDataHint2", { name: document.name })
                        }),
                        buttons: {
                            import: {
                                icon: '<i class="fas fa-file-import"></i>',
                                label: "Import",
                                callback: async (html) => {
                                    const form = html.find("form")[0];
                                    if (!form.data.files.length) return ui.notifications.error("You did not upload a data file!");
                                    readTextFromFile(form.data.files[0]).then(async (json) => {
                                        let importData = JSON.parse(json);
                                        let docs = importData instanceof Array ? importData : [importData];
                                        for (let docData of docs) {
                                            let name = docData.name;
                                            const doc = new TileDocument(docData, { strict: true });

                                            // Treat JSON import using the same workflows that are used when importing from a compendium pack
                                            const data = doc.toObject();
                                            delete data.folder;
                                            delete data.sort;
                                            delete data.ownership;
                                            data.name = name;

                                            // Preserve certain fields from the destination document
                                            const preserve = Object.fromEntries(["_id", "sort", "ownership"].map(k => {
                                                return [k, foundry.utils.getProperty(document, k)];
                                            }));
                                            preserve.folder = document.folder;
                                            foundry.utils.mergeObject(data, preserve);

                                            if (importData instanceof Array)
                                                data._id = randomID();

                                            data.visible = true;
                                            delete data.img;
                                            data.img = data.texture.src;
                                            data.id = data._id;
                                            data.thumbnail = data.img || "modules/monks-active-tiles/img/cube.svg";
                                            if (VideoHelper.hasVideoExtension(data.thumbnail)) {
                                                const t = await ImageHelper.createThumbnail(data.thumbnail, { width: 60, height: 60 });
                                                data.thumbnail = t.thumb;
                                            }

                                            // Commit the import as an update to this document
                                            if (importData instanceof Array)
                                                templates.push(data);
                                            else
                                                templates.findSplice(t => t._id == replaceId, data);
                                            ui.notifications.info(game.i18n.format("DOCUMENT.Imported", { document: TileDocument.documentName, name: data.name }));
                                        }
                                        await game.settings.set("monks-active-tiles", "tile-templates", templates);
                                        new TileTemplates().render(true);
                                    });
                                }
                            },
                            no: {
                                icon: '<i class="fas fa-times"></i>',
                                label: "Cancel"
                            }
                        },
                        default: "import"
                    }, {
                        width: 400
                    }).render(true);
                }
            }
        ];
    }
}