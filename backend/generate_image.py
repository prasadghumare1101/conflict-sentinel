from PIL import Image, ImageDraw

def generate_synthetic_image(width=1024, height=1024, filename="satellite_placeholder.jpg"):
    """
    Generates a synthetic satellite image with a dark background, 
    and some rectangles to simulate buildings.
    """
    # Dark grey background, simulating ground
    img = Image.new('RGB', (width, height), color = '#3d3d3d')
    draw = ImageDraw.Draw(img)

    # Draw some "roads" (thin grey lines)
    draw.line((0, 100, width, 110), fill='#5a5a5a', width=4)
    draw.line((400, 0, 410, height), fill='#5a5a5a', width=3)
    draw.line((700, 0, 690, height), fill='#5a5a5a', width=5)

    # Draw some "buildings" (lighter grey rectangles)
    # These will be our targets for object detection.
    # Format: (x0, y0, x1, y1)
    buildings = [
        (150, 200, 250, 300),
        (280, 250, 330, 350),
        (180, 400, 280, 450),
        (500, 500, 650, 600),
        (750, 300, 800, 500),
        (850, 650, 950, 700),
    ]

    for b in buildings:
        draw.rectangle(b, fill='#a9a9a9', outline='#c0c0c0')

    img.save(filename)
    print(f"Generated synthetic image: {filename}")

if __name__ == "__main__":
    generate_synthetic_image()
