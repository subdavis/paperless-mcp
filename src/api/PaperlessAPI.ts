// Thin client for the paperless-ngx REST API. Ported from the reference
// nloui/paperless-mcp implementation — it already only relies on Web-standard
// fetch/FormData/Blob/File, so it runs unchanged on Cloudflare Workers.

/** Builds a `?page=&page_size=` query string, omitting params that weren't provided. */
function paginationQuery(page?: number, pageSize?: number): string {
  const params = new URLSearchParams();
  if (page) params.set("page", page.toString());
  if (pageSize) params.set("page_size", pageSize.toString());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class PaperlessAPI {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/api${path}`;
    const headers = {
      Authorization: `Token ${this.token}`,
      Accept: "application/json; version=5",
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => undefined);
      }
      console.error("paperless-ngx request failed", {
        url,
        method: options.method ?? "GET",
        status: response.status,
        body,
      });
      throw new Error(
        `Paperless-ngx request failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  // Document operations
  async bulkEditDocuments(documents: number[], method: string, parameters: Record<string, unknown> = {}) {
    return this.request("/documents/bulk_edit/", {
      method: "POST",
      body: JSON.stringify({
        documents,
        method,
        parameters,
      }),
    });
  }

  async postDocument(
    file: File,
    metadata: {
      title?: string;
      created?: string;
      correspondent?: number;
      document_type?: number;
      storage_path?: number;
      tags?: number[];
      archive_serial_number?: string;
      custom_fields?: number[];
    } = {}
  ) {
    const formData = new FormData();
    formData.append("document", file);

    if (metadata.title) formData.append("title", metadata.title);
    if (metadata.created) formData.append("created", metadata.created);
    if (metadata.correspondent !== undefined)
      formData.append("correspondent", String(metadata.correspondent));
    if (metadata.document_type !== undefined)
      formData.append("document_type", String(metadata.document_type));
    if (metadata.storage_path !== undefined)
      formData.append("storage_path", String(metadata.storage_path));
    if (metadata.tags) {
      metadata.tags.forEach((tag) => formData.append("tags", String(tag)));
    }
    if (metadata.archive_serial_number) {
      formData.append("archive_serial_number", metadata.archive_serial_number);
    }
    if (metadata.custom_fields) {
      metadata.custom_fields.forEach((field) =>
        formData.append("custom_fields", String(field))
      );
    }

    const response = await fetch(
      `${this.baseUrl}/api/documents/post_document/`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${this.token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(
        `Paperless-ngx upload failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  async getDocuments(query = "") {
    return this.request(`/documents/${query}`);
  }

  async getDocument(id: number) {
    return this.request(`/documents/${id}/`);
  }

  async searchDocuments(query: string, page?: number, pageSize?: number) {
    const params = new URLSearchParams();
    params.set("query", query);
    if (page) params.set("page", page.toString());
    if (pageSize) params.set("page_size", pageSize.toString());

    const response: any = await this.request(`/documents/?${params.toString()}`);

    // Filter out content field and long URLs to reduce token usage
    if (response.results) {
      response.results = response.results.map((doc: any) => {
        const { content, download_url, thumbnail_url, ...rest } = doc;
        return {
          ...rest,
          // Include only document ID for constructing URLs if needed
          id: doc.id,
        };
      });
    }

    return response;
  }

  async downloadDocument(id: number, asOriginal = false) {
    const query = asOriginal ? "?original=true" : "";
    const response = await fetch(
      `${this.baseUrl}/api/documents/${id}/download/${query}`,
      {
        headers: {
          Authorization: `Token ${this.token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Paperless-ngx download failed: ${response.status} ${response.statusText}`
      );
    }
    return response;
  }

  // Tag operations
  async getTags(page?: number, pageSize?: number) {
    return this.request(`/tags/${paginationQuery(page, pageSize)}`);
  }

  async createTag(data: Record<string, unknown>) {
    return this.request("/tags/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTag(id: number, data: Record<string, unknown>) {
    return this.request(`/tags/${id}/`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id: number) {
    return this.request(`/tags/${id}/`, {
      method: "DELETE",
    });
  }

  // Correspondent operations
  async getCorrespondents(page?: number, pageSize?: number) {
    return this.request(`/correspondents/${paginationQuery(page, pageSize)}`);
  }

  async createCorrespondent(data: Record<string, unknown>) {
    return this.request("/correspondents/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Document type operations
  async getDocumentTypes(page?: number, pageSize?: number) {
    return this.request(`/document_types/${paginationQuery(page, pageSize)}`);
  }

  async createDocumentType(data: Record<string, unknown>) {
    return this.request("/document_types/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Bulk object operations (tags / correspondents / document_types)
  async bulkEditObjects(
    objects: number[],
    objectType: string,
    operation: string,
    parameters: Record<string, unknown> = {}
  ) {
    return this.request("/bulk_edit_objects/", {
      method: "POST",
      body: JSON.stringify({
        objects,
        object_type: objectType,
        operation,
        ...parameters,
      }),
    });
  }
}
