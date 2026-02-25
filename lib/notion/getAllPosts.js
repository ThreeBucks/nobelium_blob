import { config as BLOG } from '@/lib/server/config'

import { idToUuid } from 'notion-utils'
import dayjs from 'dayjs'
import api from '@/lib/server/notion-api'
import getAllPageIds from './getAllPageIds'
import getPageProperties from './getPageProperties'
import filterPublishedPosts from './filterPublishedPosts'

/**
 * @param {{ includePages: boolean }} - false: posts only / true: include pages
 */
export async function getAllPosts ({ includePages = false }) {
  const id = idToUuid(process.env.NOTION_PAGE_ID)

  let response
  try {
    response = await api.getPage(id)
  } catch {
    console.warn(
      `[notion] unable to fetch page "${id}". ` +
      'Please check NOTION_PAGE_ID and NOTION_ACCESS_TOKEN configuration.'
    )
    return []
  }

  const collection = Object.values(response.collection)[0]?.value
  const collectionQuery = response.collection_query
  const block = response.block
  const schema = collection?.schema

  const pageBlock = block?.[id]?.value

  // Allow using a regular page id that contains an inline/full-page database.
  const fallbackDatabaseBlock = Object.values(block || {}).find(row => {
    const type = row?.value?.type
    return type === 'collection_view_page' || type === 'collection_view'
  })?.value

  const rawMetadata =
    pageBlock?.type === 'collection_view_page' || pageBlock?.type === 'collection_view'
      ? pageBlock
      : fallbackDatabaseBlock

  if (!rawMetadata) {
    console.warn(
      `[notion] pageId "${id}" is not a database and no database was found inside that page. ` +
      'Please set NOTION_PAGE_ID to a Notion database id or a page that contains one.'
    )
    return []
  }

  // Construct Data
  const pageIds = getAllPageIds(collectionQuery)
  const data = []
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]
    const properties = (await getPageProperties(id, block, schema)) || null

    // Add fullwidth to properties
    properties.fullWidth = block[id].value?.format?.page_full_width ?? false
    // Convert date (with timezone) to unix milliseconds timestamp
    properties.date = (
      properties.date?.start_date
        ? dayjs.tz(properties.date?.start_date)
        : dayjs(block[id].value?.created_time)
    ).valueOf()

    data.push(properties)
  }

  // remove all the the items doesn't meet requirements
  const posts = filterPublishedPosts({ posts: data, includePages })

  // Sort by date
  if (BLOG.sortByDate) {
    posts.sort((a, b) => b.date - a.date)
  }
  return posts
}
