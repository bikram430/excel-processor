
import subprocess
import sys
import os
from datetime import datetime


def clear_screen():
    """Clear the console screen"""
    os.system('cls' if os.name == 'nt' else 'clear')


def print_header():
    """Print the program header"""
    print("=" * 70)
    print("       PRODUCTION BATCH PROCESSING SYSTEM")
    print("=" * 70)
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    print()


def ask_continue(message: str = "Do you want to continue?") -> bool:
    """Ask user if they want to continue"""
    while True:
        response = input(f"\n{message} (Y/N): ").strip().lower()
        if response in ['y', 'yes']:
            return True
        elif response in ['n', 'no']:
            return False
        else:
            print("Please enter Y or N")


def run_script(script_name: str, description: str) -> bool:
    """Run a Python script and return True if successful"""
    print()
    print("=" * 70)
    print(f"  RUNNING: {description}")
    print(f"  Script: {script_name}")
    print("=" * 70)
    print()
    
    try:
        result = subprocess.run([sys.executable, script_name])
        
        if result.returncode == 0:
            print()
            print(f"✅ {description} completed successfully!")
            return True
        else:
            print()
            print(f"❌ {description} failed with error code: {result.returncode}")
            return False
            
    except FileNotFoundError:
        print(f"❌ ERROR: Script not found: {script_name}")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def main():
    clear_screen()
    print_header()
    
    # Define the scripts to run in order
    scripts = [
        {
            "file": "read.py",
            "name": "Input File Reader",
            "description": "Read and validate input files",
            "ask_before": False,  # First script runs automatically
        },
        {
            "file": "recipebatchprinter.py",
            "name": "Recipe Batch Printer",
            "description": "Create batch recipe files in temp_print folder",
            "ask_before": True,
        },
        {
            "file": "meatextractor.py",
            "name": "Meat Extractor",
            "description": "Extract meat requirements from recipes",
            "ask_before": True,
        },
        {
            "file": "templeteeditor.py",
            "name": "Template Editor",
            "description": "Generate department production templates",
            "ask_before": True,
        },
    ]
    
    print("This program will run the following scripts in order:")
    print()
    for i, script in enumerate(scripts, 1):
        print(f"  {i}. {script['name']}")
        print(f"     → {script['description']}")
        print()
    
    if not ask_continue("Ready to start?"):
        print("\nExiting...")
        return
    
    # Run each script
    for i, script in enumerate(scripts):
        # Ask user before running (except first script)
        if script["ask_before"]:
            if not ask_continue(f"Run {script['name']}?"):
                print(f"\nSkipping {script['name']}...")
                continue
        
        # Run the script
        success = run_script(script["file"], script["name"])
        
        if not success:
            print(f"\n⚠️  {script['name']} encountered issues.")
            if not ask_continue("Continue to next step anyway?"):
                print("\nStopping process...")
                break
    
    # Final summary
    print()
    print("=" * 70)
    print("  PROCESS COMPLETE")
    print("=" * 70)
    print()
    print("Check the following locations for output:")
    print("  📁 temp_print/ - Recipe files and production lists")
    print("  📁 logs/ - Processing logs")
    print()
    
    input("Press Enter to exit...")


if __name__ == "__main__":
    main()