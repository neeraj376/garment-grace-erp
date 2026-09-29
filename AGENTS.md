# Project architecture rules

- Product-video imports clean each selected frame server-side with the Lovable AI image-editing endpoint, then store the result under the authenticated store prefix; this preserves credentials and tenant isolation.
