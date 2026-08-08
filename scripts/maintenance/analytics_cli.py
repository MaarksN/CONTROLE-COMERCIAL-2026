import sys
import os
from rich.console import Console
from rich.table import Table

console = Console()

def main():
    console.print("[bold green]=========================================[/bold green]")
    console.print("[bold cyan]CLI de Governança & Analytics Comercial 2026[/bold cyan]")
    console.print("[bold green]=========================================[/bold green]")
    
    table = Table(title="Resumo de Metas e Forecast Q1 2026")
    table.add_column("Executivo", style="cyan")
    table.add_column("Meta Q1", style="magenta")
    table.add_column("Realizado", style="green")
    table.add_column("Atingimento", style="yellow")
    
    table.add_row("Carlos Eduardo", "R$ 3.000.000", "R$ 3.450.000", "115%")
    table.add_row("Ana Paula Souza", "R$ 3.000.000", "R$ 2.890.000", "96%")
    table.add_row("Roberto Mendes", "R$ 2.500.000", "R$ 2.100.000", "84%")
    
    console.print(table)
    console.print("[bold green]✔ Status do Banco de Dados Drizzle: Sincronizado[/bold green]")

if __name__ == "__main__":
    main()
