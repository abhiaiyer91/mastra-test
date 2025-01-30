import { Workflow, Step } from '@mastra/core';
import { embed, MDocument, embedMany } from '@mastra/rag';
// import { embed, MDocument } from '@mastra/rag';
import { z } from 'zod';

const getDirectory = new Step({
  id: 'fetch-directory',
  description: 'Fetch directory',
  inputSchema: z.object({}),
  outputSchema: z.object({
    companies: z.array(z.object({}))
  }),
  execute: async ({ context }) => {
    console.log(context.machineContext?.triggerData?.pageCount)

    const ycDirectory = await fetch("https://45bwzj1sgc-dsn.algolia.net/1/indexes/*/queries?x-algolia-agent=Algolia%20for%20JavaScript%20(3.35.1)%3B%20Browser%3B%20JS%20Helper%20(3.16.1)&x-algolia-application-id=45BWZJ1SGC&x-algolia-api-key=MjBjYjRiMzY0NzdhZWY0NjExY2NhZjYxMGIxYjc2MTAwNWFkNTkwNTc4NjgxYjU0YzFhYTY2ZGQ5OGY5NDMxZnJlc3RyaWN0SW5kaWNlcz0lNUIlMjJZQ0NvbXBhbnlfcHJvZHVjdGlvbiUyMiUyQyUyMllDQ29tcGFueV9CeV9MYXVuY2hfRGF0ZV9wcm9kdWN0aW9uJTIyJTVEJnRhZ0ZpbHRlcnM9JTVCJTIyeWNkY19wdWJsaWMlMjIlNUQmYW5hbHl0aWNzVGFncz0lNUIlMjJ5Y2RjJTIyJTVE", {
      "headers": {
        "accept": "application/json",
      },
      "body": `{"requests":[{"indexName":"YCCompany_production","params":"facets=%5B%22app_answers%22%2C%22app_video_public%22%2C%22batch%22%2C%22demo_day_video_public%22%2C%22industries%22%2C%22isHiring%22%2C%22nonprofit%22%2C%22question_answers%22%2C%22regions%22%2C%22subindustry%22%2C%22top_company%22%5D&hitsPerPage=1000&maxValuesPerFacet=1000&page=${context.machineContext?.triggerData?.pageCount || 0}&query=&tagFilters="}]}`,
      "method": "POST"
    });


    const data = await ycDirectory.json()

    console.log(data)

    const companies = data?.results?.flatMap((result: any) => {
      return result?.hits
    }).map((hit: any) => {
      return {
        id: `${hit?.id}`,
        name: hit?.name,
        long_description: hit?.long_description,
        one_liner: hit?.one_liner,
        industry: hit?.industries,
        subindustry: hit?.subindustry,
        tags: hit?.tags,
        all_locations: hit?.all_locations,
        stage: hit?.stage,
      }
    })
    return { companies };
  },
});

export const chunkCompanies = new Step({
  id: 'chunk-companies',
  description: 'Index companies',
  execute: async ({ context, mastra }) => {
    const result = context.machineContext?.getStepPayload<{ companies: any[] }>('fetch-directory')


    if (!result) {
      return;
    }

    let chunks: any[] = []

    for (const company of result?.companies) {
      const doc = MDocument.fromText(
        `${company.name}\n\n${company.one_liner}\n\n${company.long_description}`, {
        id: company.id,
        name: company.name,
        industry: company.industry,
        subindustry: company.subindustry,
        stage: company.stage,
        team_size: company.team_size,
        locations: company.all_locations,
        tags: company.tags,
        batch: company.batch,
        status: company.status,
      })

      const result = await doc.chunk()

      chunks = chunks.concat(result)
    }

    return { chunks }
  },
});

export const createIndex = new Step({
  id: 'create-index',
  description: 'Create index',
  execute: async ({ context, mastra }) => {
    if (!mastra?.vectors?.libsql) {
      throw new Error('LibSQL vector is not initialized')
    }
    try {
      await mastra.vectors.libsql.createIndex('companies_index', 1536)
    } catch (err) {
      if (err instanceof Error) {
        mastra?.logger?.error(err.message, { err })
      }
    }
  }
});

export const indexCompanies = new Step({
  id: 'index-companies',
  description: 'Index companies',
  execute: async ({ context, mastra }) => {
    if (!mastra?.vectors?.libsql) {
      throw new Error('LibSQL vector is not initialized')
    }

    const chunks = context.machineContext?.getStepPayload<{ chunks: any[] }>('chunk-companies')?.chunks

    if (!chunks) {
      return
    }

    try {
      console.log('Indexing started')

      const { embeddings } = await embedMany(chunks, {
        provider: "OPEN_AI",
        model: "text-embedding-3-small",
        maxRetries: 3,
      })

      const res = await mastra.vectors.libsql.upsert('companies_index', embeddings, chunks.map((c) => c.metadata), chunks.map((c) => c.metadata.id))

      console.log(res)

      console.log('Indexing completed')
    } catch (err) {
      console.log(err)
      if (err instanceof Error) {
        console?.error(err.message, { err })
      }
    }
  },
});

const testQuery = new Step({
  id: 'test-query',
  description: 'Test query',
  execute: async ({ context, mastra }) => {
    if (!mastra?.vectors?.libsql) {
      throw new Error('LibSQL vector is not initialized')
    }

    const { embedding } = await embed('Find me airbnb', {
      provider: "OPEN_AI",
      model: "text-embedding-3-small",
      maxRetries: 3,
    })

    const results = await mastra.vectors.libsql.query("companies_index", embedding, 3);

    console.log(results)

    return results
  }
})

export const syncYcDirectoryWorkflow = new Workflow({
  name: 'yc-sync-directory',
  triggerSchema: z.object({
    pageCount: z.number(),
  }),
});

syncYcDirectoryWorkflow
  .step(createIndex)
  .then(getDirectory)
  .then(chunkCompanies)
  .then(indexCompanies)
  .then(testQuery)
  .commit();
