import type {ReelsMedia} from '../types/global';
import {saveHighlights, saveProfileReel, saveReels, saveStories} from './fn';
import {CONFIG_LIST, MESSAGE_OPEN_URL, MESSAGE_ZIP_DOWNLOAD} from '../constants';
import {BlobReader, BlobWriter, TextReader, ZipWriter} from '@zip.js/zip.js';

declare const browser: typeof chrome;

browser.runtime.onInstalled.addListener(async () => {
    const result = await browser.storage.sync.get(CONFIG_LIST);
    CONFIG_LIST.forEach((i) => {
        if (result[i] === undefined) {
            browser.storage.sync.set({
                [i]: true,
            });
        }
    });
});

browser.runtime.onStartup.addListener(() => {
    browser.storage.local.set({stories_user_ids: [], id_to_username_map: []});
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(message, sender);
    const {type, data, api} = message;

    if (type === MESSAGE_OPEN_URL) {
        browser.tabs.create({url: data, index: sender.tab!.index + 1});
        return false;
    }

    if (type === MESSAGE_ZIP_DOWNLOAD) {
        (async () => {
            const zipFileWriter = new BlobWriter();
            const zipWriter = new ZipWriter(zipFileWriter);
            for (const item of data.blobList) {
                const {filename, content} = item;
                if (filename === "caption.txt") {
                    await zipWriter.add(filename, new TextReader(content), {
                        useWebWorkers: false,
                    });
                    continue;
                }
                let extension = content.type.split('/').pop() || 'jpg';
                const {setting_format_replace_jpeg_with_jpg} = await browser.storage.sync.get(['setting_format_replace_jpeg_with_jpg']);
                if (setting_format_replace_jpeg_with_jpg) {
                    extension = extension.replace('jpeg', 'jpg');
                }
                await zipWriter.add(filename + '.' + extension, new BlobReader(content), {
                    useWebWorkers: false,
                });
            }
            const zipContent = await zipWriter.close();
            const blobUrl = URL.createObjectURL(zipContent);
            downloadZip(blobUrl, data.zipFileName + '.zip');
        })();
        return false;
    }

    async function addThreads(data: any[]) {
        const {threads} = await browser.storage.local.get(['threads']);
        const newMap = new Map(threads);
        for (const item of data) {
            if (!item) continue;
            const code = item.post?.code || item.code;
            if (code) {
                newMap.set(code, item);
            }
        }
        await browser.storage.local.set({threads: Array.from(newMap)});
    }

    function findValueByKey(obj: Record<string, any>, key: string): any {
        for (const property in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, property)) {
                if (property === key) {
                    return obj[property];
                } else if (typeof obj[property] === 'object') {
                    const result = findValueByKey(obj[property], key);
                    if (result !== undefined) {
                        return result;
                    }
                }
            }
        }
    }

    if (type === 'threads_searchResults') {
        data
            .split(/\s*for\s+\(;;\);\s*/)
            .filter((_: any) => _)
            .map(async (i: any) => {
                try {
                    const result = findValueByKey(JSON.parse(i), 'searchResults');
                    if (result && Array.isArray(result.edges)) {
                        await addThreads(result.edges.map((i: any) => i.node.thread.thread_items).flat());
                    }
                } catch {
                }
            });
        return false;
    }

    if (type === 'threads') {
        addThreads(data);
        return false;
    }

    if (type === 'stories') {
        (async () => {
            const {
                stories_user_ids,
                id_to_username_map
            } = await browser.storage.local.get(['stories_user_ids', 'id_to_username_map']);
            const nameToId = new Map(stories_user_ids);
            const idToName = new Map(id_to_username_map);
            nameToId.set(data.username, data.user_id);
            idToName.set(data.user_id, data.username);
            await browser.storage.local.set({
                stories_user_ids: Array.from(nameToId),
                id_to_username_map: Array.from(idToName)
            });
            sendResponse();
        })();
        return true;
    }

    (async () => {
        try {
            const jsonData = JSON.parse(data);

            switch (api) {
                case 'https://www.instagram.com/api/graphql':
                    saveStories(jsonData);
                    break;
                case 'https://www.instagram.com/graphql/query':
                    saveHighlights(jsonData);
                    saveReels(jsonData);
                    saveStories(jsonData);
                    saveProfileReel(jsonData);
                    break;
                case '/api/v1/feed/reels_media/?reel_ids=':
                    const {reels, reels_media} = await browser.storage.local.get(['reels', 'reels_media']);
                    const newArr = (reels_media || []).filter(
                        (i: ReelsMedia.ReelsMedum) => !(jsonData as ReelsMedia.Root).reels_media.find((j) => j.id === i.id)
                    );
                    browser.storage.local.set({
                        reels: Object.assign({}, reels, data.reels),
                        reels_media: [...newArr, ...jsonData.reels_media],
                    });
                    break;
            }
        } catch {
        }
        sendResponse();
    })();

    return true;
});

function downloadZip(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
