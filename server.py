#!/usr/bin/env python3
"""
Simple SPA server for cos102-quiz
Serves index.html for all missing files (client-side routing)
"""
import http.server
import os
from pathlib import Path

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Get the requested file path
        requested_path = self.translate_path(self.path)
        
        # If file doesn't exist and it's not a real file/directory, serve index.html
        if not os.path.isfile(requested_path) and not os.path.isdir(requested_path):
            # Don't interfere with API calls or special paths
            if not self.path.startswith('/api/') and not self.path.startswith('/.'):
                self.path = '/index.html'
        
        return super().do_GET()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = 8000
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, SPAHandler)
    print(f'🚀 Serving COS 102 Quiz on http://localhost:{port}')
    httpd.serve_forever()
