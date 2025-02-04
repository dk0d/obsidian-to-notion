import { Notice, requestUrl, TFile, normalizePath, App } from "obsidian";
import { Client } from "@notionhq/client";
import { markdownToBlocks } from "@tryfabric/martian";
import * as yamlFrontMatter from "yaml-front-matter";
import * as yaml from "yaml";
import MyPlugin from "main";
export class Upload2Notion {
	app: MyPlugin;
	notion: Client;
	agent: any;

	constructor(app: MyPlugin) {
		this.app = app;
		this.notion = new Client({ auth: this.app.settings.notionAPI });
	}

	async deletePage(notionID: string) {
		const response = await requestUrl({
			url: `https://api.notion.com/v1/blocks/${notionID}`,
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer " + this.app.settings.notionAPI,
				"Notion-Version": "2022-02-22",
			},
			body: "",
		});
		return response;
	}

	async updatePage(
		notionID: string,
		title: string,
		allowTags: boolean,
		tags: string[],
		childArr: any
	) {
		await this.deletePage(notionID);
		const res = await this.createPage(title, allowTags, tags, childArr);
		return res;
	}

	async createPage(
		title: string,
		allowTags: boolean,
		tags: string[],
		childArr: any
	) {
		const bodyString: any = {
			parent: {
				type: "database_id",
				database_id: this.app.settings.databaseID,
			},
			properties: {
				Page: {
					title: [
						{
							text: {
								content: title,
							},
						},
					],
				},
				Tags: {
					multi_select:
						allowTags && tags !== undefined
							? tags.map((tag) => {
								return { name: tag };
							})
							: [],
				},
			},
			children: childArr,
		};

		if (this.app.settings.bannerUrl) {
			bodyString.cover = {
				type: "external",
				external: {
					url: this.app.settings.bannerUrl,
				},
			};
		}

		try {
			// const response = await this.notion.pages.create(bodyString);
			const response = await requestUrl({
				url: `https://api.notion.com/v1/pages`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// 'User-Agent': 'obsidian.md',
					Authorization: `Bearer ${this.app.settings.notionAPI}`,
					"Notion-Version": "2022-06-28", //"2021-08-16",
				},
				body: JSON.stringify(bodyString),
			});
			return response;
		} catch (error) {
			new Notice(`network error ${error.message}\n${error.response}`);
		}
	}

	async syncMarkdownToNotion(
		title: string,
		allowTags: boolean,
		tags: string[],
		markdown: string,
		nowFile: TFile,
		app: App,
		settings: any
	): Promise<any> {
		let res: any;
		const yamlObj: any = yamlFrontMatter.loadFront(markdown);
		const __content = yamlObj.__content;
		const file2Block = markdownToBlocks(__content);
		const frontmasster = await app.metadataCache.getFileCache(nowFile)
			?.frontmatter;
		const notionID = frontmasster ? frontmasster.notionID : null;

		if (notionID) {
			res = await this.updatePage(
				notionID,
				title,
				allowTags,
				tags,
				file2Block
			);
		} else {
			res = await this.createPage(title, allowTags, tags, file2Block);
		}

		if (res) {
			if (res.status === 200) {
				await this.updateYamlInfo(
					markdown,
					nowFile,
					res,
					app,
					settings
				);
			} else {
				new Notice(`${res.text}`);
			}
		} else {
			new Notice(`${res}`);
		}

		return res;
	}

	async updateYamlInfo(
		yamlContent: string,
		nowFile: TFile,
		res: any,
		app: App,
		settings: any
	) {
		const yamlObj: any = yamlFrontMatter.loadFront(yamlContent);
		let { url, id } = res.json;
		// replace www to notionID
		const { notionID } = settings;
		if (notionID !== "") {
			// replace url str "www" to notionID
			url = url.replace("www.notion.so", `${notionID}.notion.site`);
		}
		yamlObj.link = url;
		try {
			await navigator.clipboard.writeText(url);
		} catch (error) {
			new Notice(`${error}`);
		}
		yamlObj.notionID = id;
		const __content = yamlObj.__content;
		delete yamlObj.__content;
		const yamlhead = yaml.stringify(yamlObj);
		//  if yamlhead hava last \n  remove it
		const yamlhead_remove_n = yamlhead.replace(/\n$/, "");
		// if __content have start \n remove it
		const __content_remove_n = __content.replace(/^\n/, "");
		const content =
			"---\n" + yamlhead_remove_n + "\n---\n" + __content_remove_n;
		try {
			await nowFile.vault.modify(nowFile, content);
		} catch (error) {
			new Notice(`write file error ${error}`);
		}
	}
}
