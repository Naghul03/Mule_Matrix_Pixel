from typing import Dict, Any
from jinja2 import Template
from datetime import datetime

HTML_REPORT_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Mule Matrix Investigation Case Report - {{ investigation.id }}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            line-height: 1.5;
            padding: 40px;
            margin: 0;
        }
        @media print {
            body { background: white; color: black; padding: 20px; }
            .no-print { display: none; }
            .card { border: 1px solid #ccc !important; background: white !important; color: black !important; }
        }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 30px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
        .badge-critical { background-color: #f43f5e; color: white; }
        .badge-high { background-color: #ea580c; color: white; }
        .badge-info { background-color: #0284c7; color: white; }
        .badge-success { background-color: #10b981; color: white; }
        .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
        .stat-val { font-size: 24px; font-weight: 700; color: #14b8a6; }
        .stat-label { font-size: 12px; text-transform: uppercase; color: #94a3b8; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th { text-align: left; padding: 10px; border-bottom: 2px solid #475569; color: #94a3b8; }
        td { padding: 10px; border-bottom: 1px solid #334155; }
        .mono { font-family: monospace; font-size: 12px; }
        .stop-box { border-left: 4px solid #f59e0b; background-color: #292524; padding: 16px; border-radius: 4px; margin: 20px 0; }
        .footer { font-size: 12px; color: #64748b; margin-top: 40px; text-align: center; border-top: 1px solid #334155; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="margin: 0 0 8px 0; font-size: 28px; color: #38bdf8;">MULE MATRIX</h1>
                    <div style="color: #94a3b8; font-size: 14px;">Official Investigation Dossier & Lineage Audit Report</div>
                </div>
                <div style="text-align: right;">
                    <span class="badge badge-info">{{ investigation.status }}</span>
                    <div style="margin-top: 6px; font-size: 12px; color: #94a3b8;">Generated: {{ generated_at }}</div>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="stat-label">Accounts Discovered</div>
                <div class="stat-val">{{ investigation.summary_metrics_json.accounts_discovered }}</div>
            </div>
            <div class="card">
                <div class="stat-label">Banks Crossed</div>
                <div class="stat-val">{{ investigation.summary_metrics_json.banks_crossed }}</div>
            </div>
            <div class="card">
                <div class="stat-label">Transactions Traversed</div>
                <div class="stat-val">{{ investigation.summary_metrics_json.transactions_traversed }}</div>
            </div>
            <div class="card">
                <div class="stat-label">Max Hop Depth</div>
                <div class="stat-val">{{ investigation.summary_metrics_json.max_hop_depth }}</div>
            </div>
        </div>

        <div class="stop-box">
            <strong style="color: #fbbf24;">Traversal Stop Reason:</strong> {{ investigation.stop_reason }}
            <div style="margin-top: 4px; font-size: 13px; color: #d6d3d1;">
                Lineage traversal halted because: {{ stop_explanation }}
            </div>
        </div>

        <div class="card">
            <h3 style="margin-top: 0; color: #f1f5f9;">Trigger & Target Information</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
                <div><strong>Root Account:</strong> <span class="mono">{{ investigation.root_account_ref }}</span> ({{ investigation.root_bank_code }})</div>
                <div><strong>Investigation ID:</strong> <span class="mono">{{ investigation.id }}</span></div>
                <div><strong>Alert Linked:</strong> <span class="mono">{{ investigation.alert_id or "Manual Investigation" }}</span></div>
                <div><strong>Average Attribution Confidence:</strong> {{ (investigation.summary_metrics_json.avg_confidence * 100)|round(1) }}%</div>
            </div>
        </div>

        <div class="card">
            <h3 style="margin-top: 0; color: #f1f5f9;">Reconstructed Lineage Routes (Attributed vs Candidate)</h3>
            <div>
                <h4 style="color: #38bdf8; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">Attributed Lineage Paths (Suspicious Movement Verified via FIFO)</h4>
                {% if investigation.attributed_paths %}
                    {% for p in investigation.attributed_paths %}
                    <div style="background: #2a1215; border: 1px solid #991b1b; padding: 10px; border-radius: 4px; margin-bottom: 8px;">
                        <span class="badge badge-critical">ATTRIBUTED</span>
                        <strong class="mono" style="margin-left: 8px; color: #fecdd3;">{{ p.nodes|join(' &rarr; ') }}</strong>
                        <div style="font-size: 12px; color: #fda4af; margin-top: 4px;">{{ p.explanation }}</div>
                    </div>
                    {% endfor %}
                {% else %}
                    <div style="color: #94a3b8; font-size: 13px; margin-bottom: 12px;">No fully attributed end-to-end paths meeting certainty threshold.</div>
                {% endif %}

                <h4 style="color: #94a3b8; font-size: 13px; text-transform: uppercase; margin-top: 16px; margin-bottom: 8px;">Candidate Settlement Routes (Observed Routes with Zero or Uncertain Attributed Flow)</h4>
                {% if investigation.candidate_paths %}
                    {% for p in investigation.candidate_paths %}
                    <div style="background: #1e293b; border: 1px solid #334155; padding: 10px; border-radius: 4px; margin-bottom: 8px;">
                        <span class="badge badge-info">CANDIDATE</span>
                        <strong class="mono" style="margin-left: 8px;">{% if p.nodes %}{{ p.nodes|join(' &rarr; ') }}{% else %}{{ p|join(' &rarr; ') }}{% endif %}</strong>
                        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">{% if p.explanation %}{{ p.explanation }}{% else %}Observed route preserved in transaction graph; zero suspicious allocation under FIFO.{% endif %}</div>
                    </div>
                    {% endfor %}
                {% else %}
                    <div style="color: #94a3b8; font-size: 13px;">No candidate routes recorded.</div>
                {% endif %}
            </div>
        </div>

        <div class="card">
            <h3 style="margin-top: 0; color: #f1f5f9;">Reconstructed Chronological Lineage Timeline</h3>
            <table>
                <thead>
                    <tr>
                        <th>Timestamp (UTC)</th>
                        <th>From Account</th>
                        <th>To Account</th>
                        <th>Rail</th>
                        <th>Amount</th>
                        <th>Attributed</th>
                        <th>Classification</th>
                        <th>Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    {% for item in timeline %}
                    <tr>
                        <td class="mono">{{ item.timestamp }}</td>
                        <td><span class="mono">{{ item.source_account_ref }}</span> ({{ item.source_bank_code }})</td>
                        <td><span class="mono">{{ item.destination_account_ref }}</span> ({{ item.destination_bank_code }})</td>
                        <td>{{ item.rail }}</td>
                        <td style="font-weight: 600; color: #38bdf8;">₹{{ (item.amount_minor / 100)|round(2) }}</td>
                        <td style="font-weight: 600; color: #f43f5e;">₹{{ ((item.attributed_amount_minor or 0) / 100)|round(2) }}</td>
                        <td><span class="badge {% if item.edge_type == 'ATTRIBUTED' %}badge-critical{% else %}badge-info{% endif %}">{{ item.edge_type or 'ATTRIBUTED' }}</span></td>
                        <td>{{ (item.confidence * 100)|round(0) }}%</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>

        <div class="card">
            <h3 style="margin-top: 0; color: #f1f5f9;">Discovered Network Nodes</h3>
            <table>
                <thead>
                    <tr>
                        <th>Account Ref</th>
                        <th>Bank</th>
                        <th>Role / Direction</th>
                        <th>Hop Depth</th>
                        <th>Type</th>
                        <th>Attributed Value</th>
                        <th>Terminal Flag</th>
                    </tr>
                </thead>
                <tbody>
                    {% for n in nodes %}
                    <tr>
                        <td class="mono">{{ n.account_ref }}</td>
                        <td>{{ n.bank_code }} ({{ n.bank_name }})</td>
                        <td><span class="badge badge-info">{{ n.direction }}</span></td>
                        <td>{{ n.hop_depth }}</td>
                        <td>{{ n.account_type }}</td>
                        <td>₹{{ (n.amount_attributed_minor / 100)|round(2) }}</td>
                        <td>
                            {% if n.is_off_ramp %}
                            <span class="badge badge-critical">OFF-RAMP</span>
                            {% elif n.is_origin %}
                            <span class="badge badge-success">ORIGIN</span>
                            {% else %}
                            -
                            {% endif %}
                        </td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>

        <div class="footer">
            Generated by Mule Matrix Explainable Lineage Platform | Synthetic Financial Network Simulation | Non-Production Audit Record
        </div>
    </div>
</body>
</html>
"""

class ExportService:
    @staticmethod
    def generate_json_export(investigation_detail: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "format": "MULE_MATRIX_CASE_REPORT_V1",
            "exported_at": datetime.utcnow().isoformat(),
            "investigation": investigation_detail
        }

    @staticmethod
    def generate_html_export(investigation_detail: Dict[str, Any]) -> str:
        from backend.app.lineage.stop_reasons import STOP_REASON_DESCRIPTIONS, LineageStopReason
        
        stop_reason_val = investigation_detail.get("stop_reason")
        stop_enum = None
        for k in LineageStopReason:
            if k.value == stop_reason_val:
                stop_enum = k
                break
        stop_expl = STOP_REASON_DESCRIPTIONS.get(stop_enum, "Bounded traversal completed.")

        template = Template(HTML_REPORT_TEMPLATE)
        return template.render(
            investigation=investigation_detail,
            timeline=investigation_detail.get("timeline", []),
            nodes=investigation_detail.get("nodes", []),
            edges=investigation_detail.get("edges", []),
            stop_explanation=stop_expl,
            generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        )
